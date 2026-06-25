// 通话会话权威状态(Redis)。让多副本共享:忙线裁决、设备属主路由、grace 重连窗。
//
// 现状信令本是无状态 relay;为支持「多标签页/多设备并发裁决 + 刷新恢复」,这里引入最小的
// 服务端权威会话:谁在通话中(忙线索引)、通话由哪台设备拥有(属主路由)、掉线后保留多久(grace)。
// callId 形如 call_<callerId>_<calleeId>_<ts>。

import { redis } from '../database/redis.js';

// 会话兜底 TTL(正常靠 end/reject/grace 主动清理;异常退出靠它回收,防忙线索引泄漏)。
const SESSION_TTL = 60 * 60; // 1h
// grace 宽限窗:属主设备掉线后,保留会话等待 call:rejoin 的时长。
export const GRACE_MS = 12_000;

export type CallStatus = 'ringing' | 'connected' | 'reconnecting';
export type CallSide = 'caller' | 'callee';

export interface CallSession {
  callId: string;
  callerId: number;
  calleeId: number;
  callType: string;
  status: CallStatus;
  startTime: number | null;
  callerDevice: string | null; // 主叫属主设备
  calleeDevice: string | null; // 被叫接听设备
  graceEpoch: number; // 每次进入 reconnecting / 重连成功自增,使在途 grace 定时器失效(防竞态)
  resumeStatus?: CallStatus; // 进入 reconnecting 前的状态,重连成功后恢复到它(邀请期=ringing,通话期=connected)
}

const sKey = (callId: string) => `call:session:${callId}`;
const uKey = (userId: number) => `call:user:${userId}`;

export async function getSession(callId: string): Promise<CallSession | null> {
  const raw = await redis.get(sKey(callId));
  return raw ? (JSON.parse(raw) as CallSession) : null;
}

async function putSession(s: CallSession, ttl = SESSION_TTL): Promise<void> {
  await redis.set(sKey(s.callId), JSON.stringify(s), 'EX', ttl);
}

// 用户当前所在通话(忙线索引),无则 null。
export async function getUserCall(userId: number): Promise<string | null> {
  return redis.get(uKey(userId));
}

// 主叫发起:登记会话(ringing)+ 双方忙线索引。
// 返回 false 表示被叫忙线(已在另一通通话),调用方应回 call:busy 不振铃。
export async function tryCreateSession(args: {
  callId: string;
  callerId: number;
  calleeId: number;
  callType: string;
  callerDevice: string;
}): Promise<boolean> {
  const busy = await getUserCall(args.calleeId);
  if (busy && busy !== args.callId) return false;
  const session: CallSession = {
    callId: args.callId,
    callerId: args.callerId,
    calleeId: args.calleeId,
    callType: args.callType,
    status: 'ringing',
    startTime: null,
    callerDevice: args.callerDevice,
    calleeDevice: null,
    graceEpoch: 0,
  };
  await putSession(session);
  await redis.set(uKey(args.callerId), args.callId, 'EX', SESSION_TTL);
  await redis.set(uKey(args.calleeId), args.callId, 'EX', SESSION_TTL);
  return true;
}

// 被叫接听:首次接听(ringing)时绑定接听设备与起始时间;重连答复(已 connected)时不改属主。
export async function markAccepted(callId: string, calleeDevice: string): Promise<CallSession | null> {
  const s = await getSession(callId);
  if (!s) return null;
  if (s.status === 'ringing') {
    s.calleeDevice = calleeDevice;
    s.startTime = s.startTime ?? Date.now();
  }
  s.status = 'connected';
  await putSession(s);
  return s;
}

// 重连方回来:更新该侧属主设备并恢复 connected;自增 graceEpoch 使在途 grace 定时器失效。
export async function markRejoined(
  callId: string,
  side: CallSide,
  device: string
): Promise<CallSession | null> {
  const s = await getSession(callId);
  if (!s) return null;
  if (side === 'caller') s.callerDevice = device;
  else s.calleeDevice = device;
  // 恢复到进入重连前的状态:邀请期(ringing)主叫刷新回来仍是 ringing,等被叫接听;通话期回 connected。
  // 无 resumeStatus(如被叫接听走 rejoin 路径)默认 connected。
  s.status = s.resumeStatus ?? 'connected';
  s.resumeStatus = undefined;
  s.graceEpoch += 1;
  await putSession(s);
  await redis.expire(uKey(s.callerId), SESSION_TTL);
  await redis.expire(uKey(s.calleeId), SESSION_TTL);
  return s;
}

// 某设备掉线 → 进入 reconnecting。仅当掉线设备是属主才触发(非属主标签页掉线忽略)。
// 返回 { session, epoch } 供 grace 定时器校验;null 表示无需 grace。
export async function markReconnecting(
  callId: string,
  device: string
): Promise<{ session: CallSession; epoch: number } | null> {
  const s = await getSession(callId);
  if (!s) return null;
  const isOwner = s.callerDevice === device || s.calleeDevice === device;
  if (!isOwner) return null;
  if (s.status !== 'reconnecting') s.resumeStatus = s.status; // 记住进入重连前的状态(ringing/connected)
  s.status = 'reconnecting';
  s.graceEpoch += 1;
  await putSession(s);
  return { session: s, epoch: s.graceEpoch };
}

// 清理会话与双方忙线索引。返回被清理的会话(供调用方拿双方 id 广播 end)。
export async function clearSession(callId: string): Promise<CallSession | null> {
  const s = await getSession(callId);
  if (s) {
    await redis.del(uKey(s.callerId));
    await redis.del(uKey(s.calleeId));
  }
  await redis.del(sKey(callId));
  return s;
}
