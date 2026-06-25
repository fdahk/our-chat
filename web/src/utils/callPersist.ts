// 通话上下文持久化(sessionStorage)。仅存「重建一通话」所需的精简信息,不存媒体流/SDP。
//
// 用 sessionStorage:刷新保留(可恢复)、关标签页即清(不复活)、按标签页隔离(天然规避多标签串话)。
// 带 savedAt + TTL 兜底:防止「过几分钟打开旧标签页复活早已结束的通话」。

import type { CallUser, CallType } from '../globalType/call';

const KEY = 'oc.call.active';
const TTL_MS = 2 * 60 * 1000; // 2min

export interface PersistedCall {
  callId: string;
  peer: CallUser; // 对端
  callType: CallType;
  role: 'caller' | 'callee';
  // 持久化时所处阶段:calling=主叫呼叫中、ringing=被叫来电中、connected=通话中。
  // 决定刷新后的恢复方式:calling/connected 重发 offer,ringing 复原来电界面等接听。
  status: 'calling' | 'ringing' | 'connected';
  startTime: number | null; // 续算通话时长
  isMuted: boolean;
  savedAt: number; // TTL 基准
}

export function saveActiveCall(c: Omit<PersistedCall, 'savedAt'>): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...c, savedAt: Date.now() }));
  } catch {
    // 隐私模式/配额异常忽略,不影响通话本身
  }
}

export function loadActiveCall(): PersistedCall | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as PersistedCall;
    if (!c?.callId || typeof c.savedAt !== 'number' || Date.now() - c.savedAt > TTL_MS) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return c;
  } catch {
    return null;
  }
}

export function clearActiveCall(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
