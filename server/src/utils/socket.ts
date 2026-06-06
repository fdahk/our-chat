import { Server } from 'socket.io'; //基于WebSocket的实时通信库
import type { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import type { Prisma } from '../generated/prisma/index.js';
import { prisma } from '../database/prisma.js';
import { config } from '../config/config.js';
import { TOKEN_COOKIE } from './authCookies.js';

// 握手验签后把用户身份挂到 socket 上，房间号即用户 id。
declare module 'socket.io' {
  interface Socket {
    userId?: number;
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

    // 兼容前端的 join 事件，但忽略其传参，始终只加入自己的房间
    socket.on('join', () => {
      socket.join(room(socket.userId as number));
      console.log(`用户 ${socket.userId} 加入房间`);
    });

    // 消息处理
    socket.on('sendMessage', async (msg) => {
      try {
        // 防伪造：发送者必须是当前已认证用户本人
        if (Number(msg.senderId) !== Number(socket.userId)) {
          socket.emit('error', { message: '非法的发送者身份' });
          return;
        }
        const splited = msg.conversationId.split('_');
        const user1 = splited[1];
        const user2 = splited[2];

        // 单事务:upsert Conversation → 写消息 → 双方 UserConversation upsert,
        // 关系层与消息层原子一致。
        // (相比 Mongo+MySQL 双库的应用层 best-effort 协调,这是 PG 单库带来的核心收益之一)
        const savedMsg = await prisma.$transaction(async (tx) => {
          await tx.conversation.upsert({
            where: { id: msg.conversationId },
            create: { id: msg.conversationId, convType: 'single' },
            update: {},
          });
          const created = await tx.message.create({
            data: {
              conversationId: String(msg.conversationId),
              senderId: BigInt(Number(msg.senderId)),
              content: String(msg.content ?? ''),
              type: String(msg.type ?? 'text'),
              status: String(msg.status ?? 'sent'),
              mentions: (msg.mentions ?? []) as Prisma.InputJsonValue,
              isEdited: Boolean(msg.isEdited),
              isDeleted: Boolean(msg.isDeleted),
              extra: (msg.extra ?? {}) as Prisma.InputJsonValue,
              fileInfo: (msg.fileInfo ?? {}) as Prisma.InputJsonValue,
              editHistory: (msg.editHistory ?? []) as Prisma.InputJsonValue,
              ...(msg.timestamp ? { timestamp: new Date(msg.timestamp) } : {}),
            },
          });
          for (const uid of [user1, user2]) {
            await tx.userConversation.upsert({
              where: {
                userId_conversationId: {
                  userId: BigInt(Number(uid)),
                  conversationId: msg.conversationId,
                },
              },
              create: {
                userId: BigInt(Number(uid)),
                conversationId: msg.conversationId,
              },
              update: {},
            });
          }
          return created;
        });
        console.log('消息保存成功:', savedMsg.id);

        // 广播消息
        io.to(room(parseInt(user1))).emit('receiveMessage', savedMsg);
        io.to(room(parseInt(user2))).emit('receiveMessage', savedMsg);
        console.log('消息广播成功');
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

    // 断开连接
    socket.on('disconnect', () => {
      console.log('用户断开连接:', socket.id);
    });
  });

  return io;
};
