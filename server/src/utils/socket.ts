import { Server } from 'socket.io'; //基于WebSocket的实时通信库
import type { Server as HttpServer } from 'http';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import type { Prisma } from '../generated/prisma/index.js';
import { config } from '../config/config.js';
import { TOKEN_COOKIE } from './authCookies.js';
import { sendMessageInput } from '../contracts/message.js';
import { persistMessage, deriveParticipants } from '../services/message.js';
import { register, refresh, remove, REPLICA_ID } from '../realtime/presence.js';

// 握手验签后把用户身份挂到 socket 上，房间号即用户 id。
declare module 'socket.io' {
  interface Socket {
    userId?: number;
    // 设备标识:同一用户多端登录时区分物理连接。客户端可在握手时自报,缺省用 socket.id。
    deviceId?: string;
  }
}

interface TokenPayload {
  id: number;
  username: string;
}

// socket.io 的 Room 类型标注为 string，但本项目历史上一直用数字房间号（join 与 emit 两侧一致）。
// 为保持运行时行为完全不变，这里仅做类型层面的桥接，不改动实际传入的数值。
const room = (id: number): string => id as unknown as string;

// 从握手请求的 Cookie 头里取出指定 cookie 的值
const parseCookie = (header: string | undefined, name: string): string | null => {
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
};

const allowedOrigins = (
  process.env.CLIENT_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173'
)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

export const initSocket = (server: HttpServer): Server => {
  //创建WebSocket服务器，连接的建立依赖http，WebSocket的握手（连接建立）阶段，先通过http，然后升级为 WebSocket
  const io = new Server(server, {
    cors: {
      // 仅放行白名单来源，并允许携带 cookie（握手时浏览器需带上 HttpOnly token）
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`不允许的跨域来源: ${origin}`));
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // 握手鉴权：从 cookie 解析并验签 JWT，身份由服务端派生，绝不信任客户端自报的 userId。
  // 校验不过直接拒绝连接，杜绝匿名 socket 加入任意房间收发他人消息。
  io.use((socket, next) => {
    try {
      const token = parseCookie(socket.handshake.headers.cookie, TOKEN_COOKIE);
      if (!token) return next(new Error('未认证：缺少登录凭据'));
      const decoded = jwt.verify(token, config.jwtSecret) as TokenPayload;
      socket.userId = decoded.id;
      next();
    } catch {
      next(new Error('认证失败：登录凭据无效或已过期'));
    }
  });

  // 监听WebSocket连接, 注：第二个参数前端不传默认1socket实例，只能获取到socket.id
  io.on('connection', (socket) => {
    console.log('用户连接:', socket.id, 'userId:', socket.userId);

    // 连接即自动加入「自己」的房间，房间号取服务端验签得到的 userId
    socket.join(room(socket.userId as number));

    // 设备标识取握手自报值,缺省回落 socket.id(每条连接唯一)。登记到 presence 注册表,
    // 让其它副本/扇出逻辑能查到「该用户此刻有哪些在线连接、在哪台副本」(docs 15 §5.1)。
    const handshakeDeviceId = (socket.handshake.auth?.deviceId ??
      socket.handshake.query?.deviceId) as string | undefined;
    socket.deviceId =
      typeof handshakeDeviceId === 'string' && handshakeDeviceId ? handshakeDeviceId : socket.id;
    void register(socket.userId as number, {
      deviceId: socket.deviceId,
      replica: REPLICA_ID,
      socketId: socket.id,
    }).catch((err) => console.error('presence 登记失败:', err));

    // 心跳:仅续约该设备的 TTL。客户端按 ~25s 间隔发送(docs 16 §5.2)。
    socket.on('heartbeat', () => {
      void refresh(socket.userId as number, socket.deviceId as string).catch((err) =>
        console.error('presence 续约失败:', err)
      );
    });

    // 兼容前端的 join 事件，但忽略其传参，始终只加入自己的房间
    socket.on('join', () => {
      socket.join(room(socket.userId as number));
      console.log(`用户 ${socket.userId} 加入房间`);
    });

    // 落库 + 广播的公共逻辑。clientMsgId 由调用方保证(新协议来自客户端,旧协议服务端兜底生成)。
    // 落库成功后:向会话双方广播 receiveMessage(携带 seq),并把首次/去重结果交给调用方决定是否 ack。
    const persistAndBroadcast = async (input: {
      conversationId: string;
      senderId: bigint;
      clientMsgId: string;
      content: string;
      type?: string;
      mentions?: Prisma.InputJsonValue;
      extra?: Prisma.InputJsonValue;
      fileInfo?: Prisma.InputJsonValue;
    }) => {
      const participantIds = deriveParticipants(input.conversationId, input.senderId);
      const { message, deduped } = await persistMessage({ ...input, participantIds });
      // 去重命中时不重复广播(对方已收到过首次广播),仅给发送方回 ack 收敛本地状态。
      if (!deduped) {
        for (const uid of participantIds) {
          io.to(room(Number(uid))).emit('receiveMessage', message);
        }
      }
      return { message, deduped };
    };

    // 新协议:可靠上行。zod 校验 → 落库后回 message.ack(回带 seq/serverMsgId),
    // 客户端凭 ack 把本地"发送中"替换为"已发送";收不到则按同 clientMsgId 重发,服务端幂等去重。
    socket.on('message.send', async (raw) => {
      const parsed = sendMessageInput.safeParse(raw);
      if (!parsed.success) {
        socket.emit('message.error', { message: '消息参数非法', clientMsgId: (raw as { clientMsgId?: string })?.clientMsgId });
        return;
      }
      const data = parsed.data;
      try {
        const { message } = await persistAndBroadcast({
          conversationId: data.conversationId,
          senderId: BigInt(socket.userId as number), // 发送者以握手验签身份为准,不信任入参
          clientMsgId: data.clientMsgId,
          content: data.content,
          type: data.type,
          mentions: data.mentions as Prisma.InputJsonValue,
          extra: data.extra as Prisma.InputJsonValue,
          fileInfo: data.fileInfo as Prisma.InputJsonValue,
        });
        socket.emit('message.ack', {
          clientMsgId: data.clientMsgId,
          seq: message.seq,
          serverMsgId: message.id,
        });
      } catch (err) {
        console.error('message.send 处理失败:', err);
        socket.emit('message.error', { message: '消息发送失败', clientMsgId: data.clientMsgId });
      }
    });

    // 旧协议:前端尚未迁移时兼容。无 clientMsgId 时服务端生成一个,确保仍走发号/落库,
    // 但无法跨重发去重(这是迁移到 message.send 的动机)。迁移完成后可移除。
    socket.on('sendMessage', async (msg) => {
      try {
        if (Number(msg.senderId) !== Number(socket.userId)) {
          socket.emit('error', { message: '非法的发送者身份' });
          return;
        }
        await persistAndBroadcast({
          conversationId: String(msg.conversationId),
          senderId: BigInt(Number(socket.userId)),
          clientMsgId: typeof msg.clientMsgId === 'string' && msg.clientMsgId ? msg.clientMsgId : randomUUID(),
          content: String(msg.content ?? ''),
          type: String(msg.type ?? 'text'),
          mentions: (msg.mentions ?? []) as Prisma.InputJsonValue,
          extra: (msg.extra ?? {}) as Prisma.InputJsonValue,
          fileInfo: (msg.fileInfo ?? {}) as Prisma.InputJsonValue,
        });
      } catch (err) {
        console.error('消息处理失败:', err);
        socket.emit('error', { message: '消息发送失败' });
      }
    });

    // 好友请求处理
    socket.on('sendFriendReq', async (friendReq) => {
      try {
        console.log('转发好友请求:', friendReq);
        io.to(friendReq.user_id).emit('receiveFriendReq', friendReq);
      } catch (error) {
        console.error('转发好友请求失败:', error);
      }
    });

    // ====== 语音通话信令处理 ======

    // 通话发起 (包含offer)
    socket.on('call:start', (event) => {
      try {
        console.log('收到通话发起请求:', {
          callId: event.callId,
          from: event.from.username,
          to: event.to.username,
          offerSdpLength: event.offer?.sdp?.length,
        });

        // 转发给目标用户
        io.to(event.to.id).emit('call:start', event);
        console.log('通话邀请已转发给目标用户');
      } catch (error) {
        console.error('转发通话邀请失败:', error);
      }
    });

    // 通话接受 (包含answer)
    socket.on('call:accept', (event) => {
      try {
        console.log('收到通话接受，转发给发起方:', {
          callId: event.callId,
          to: event.to,
          answerSdpLength: event.answer?.sdp?.length,
        });

        // 转发给发起方 (event.to就是发起方ID)
        io.to(event.to).emit('call:accept', event);
        console.log('通话接受已转发给发起方');
      } catch (error) {
        console.error('转发通话接受失败:', error);
      }
    });

    // 通话拒绝
    socket.on('call:reject', (event) => {
      try {
        console.log('收到通话拒绝:', event.callId);

        // 从callId解析发起方ID
        const callIdParts = event.callId.split('_');
        if (callIdParts.length >= 3) {
          const callerId = parseInt(callIdParts[1]);
          io.to(room(callerId)).emit('call:reject', event);
          console.log('通话拒绝已转发给发起方:', callerId);
        }
      } catch (error) {
        console.error('转发通话拒绝失败:', error);
      }
    });

    // 通话结束
    socket.on('call:end', (event) => {
      try {
        console.log('收到通话结束信号:', event.callId);

        // 广播给双方 (从callId解析用户ID)
        const [, user1, user2] = event.callId.split('_');
        io.to(room(parseInt(user1))).emit('call:end', event);
        io.to(room(parseInt(user2))).emit('call:end', event);
        console.log('通话结束信号已广播给双方');
      } catch (error) {
        console.error('转发通话结束失败:', error);
      }
    });

    // ICE候选交换
    socket.on('call:ice', (event) => {
      try {
        console.log('收到ICE候选转发请求:', event.callId);

        // 从callId解析双方用户ID
        const [, user1, user2] = event.callId.split('_');
        const userId1 = parseInt(user1);
        const userId2 = parseInt(user2);

        // 标准做法：只转发给对方，不要发给发送方自己
        // 使用socket.to()排除发送方，避免重复处理
        socket.to(room(userId1)).emit('call:ice', event);
        socket.to(room(userId2)).emit('call:ice', event);

        console.log(`ICE候选已转发给对方用户 (排除发送方)`);
      } catch (error) {
        console.error('转发ICE候选失败:', error);
      }
    });

    // 断开连接:优雅断开即时从 presence 摘除该设备(非优雅断开靠 TTL 过期兜底)。
    socket.on('disconnect', () => {
      console.log('用户断开连接:', socket.id);
      void remove(socket.userId as number, socket.deviceId as string).catch((err) =>
        console.error('presence 摘除失败:', err)
      );
    });
  });

  return io;
};
