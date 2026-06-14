import { Prisma } from '../generated/prisma/index.js';
import type { Message } from '../generated/prisma/index.js';
import { prisma } from '../database/prisma.js';

export interface PersistMessageInput {
  conversationId: string;
  senderId: bigint;
  clientMsgId: string;
  content: string;
  type?: string;
  mentions?: Prisma.InputJsonValue;
  extra?: Prisma.InputJsonValue;
  fileInfo?: Prisma.InputJsonValue;
  // 会话参与者(单聊为双方)。用于确保 UserConversation 关系行存在。
  participantIds: bigint[];
}

export interface PersistMessageResult {
  message: Message;
  // true 表示这是一次重发命中幂等键,本次未新写入,返回的是首次落库结果。
  deduped: boolean;
}

// 落库 + 会话内发号 + 幂等去重,三件事在同一事务里完成(INV-2/INV-3)。
//   1. 同事务 UPDATE next_seq+1 RETURNING 取连续 seq —— 行锁串行化,会话内无洞无重(docs 11)。
//   2. INSERT 带 clientMsgId,撞唯一约束即重发,取首次结果返回(docs 12)。
//   3. 落库成功后调用方才回 ack —— ack 一定对应已持久化的消息。
export async function persistMessage(input: PersistMessageInput): Promise<PersistMessageResult> {
  try {
    const message = await prisma.$transaction(async (tx) => {
      // 会话不存在则建(单聊首条消息会触发)。用 ON CONFLICT DO NOTHING 而非 Prisma upsert:
      // 后者是 SELECT-then-INSERT 两步、并发首条消息会撞主键;前者由 DB 原子去重,并发安全。
      await tx.$executeRaw`
        INSERT INTO conversations (id, conv_type) VALUES (${input.conversationId}, 'single'::"ConvType")
        ON CONFLICT (id) DO NOTHING
      `;

      // 会话内发号:行锁下自增并返回,保证同会话并发写也拿到严格递增且连续的 seq。
      const bumped = await tx.$queryRaw<Array<{ next_seq: bigint }>>`
        UPDATE conversations SET next_seq = next_seq + 1
        WHERE id = ${input.conversationId}
        RETURNING next_seq
      `;
      const seq = bumped[0].next_seq;

      const created = await tx.message.create({
        data: {
          conversationId: input.conversationId,
          senderId: input.senderId,
          seq,
          clientMsgId: input.clientMsgId,
          content: input.content,
          type: input.type ?? 'text',
          status: 'sent',
          mentions: input.mentions ?? [],
          extra: input.extra ?? {},
          fileInfo: input.fileInfo ?? {},
        },
      });

      // 确保双方(单聊)的会话关系行存在。createMany + skipDuplicates 编译为
      // INSERT ... ON CONFLICT DO NOTHING,一次写入且并发安全(避免逐行 upsert 的竞态)。
      await tx.userConversation.createMany({
        data: input.participantIds.map((uid) => ({
          userId: uid,
          conversationId: input.conversationId,
        })),
        skipDuplicates: true,
      });

      return created;
    });

    return { message, deduped: false };
  } catch (e) {
    // 唯一约束冲突(并发/网络重发同 clientMsgId)是正常去重路径,不是异常:取首次结果返回。
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const existed = await prisma.message.findFirst({
        where: {
          conversationId: input.conversationId,
          senderId: input.senderId,
          clientMsgId: input.clientMsgId,
        },
      });
      if (existed) return { message: existed, deduped: true };
    }
    throw e;
  }
}

// 单聊会话 id 形如 single_<u1>_<u2>,解析出双方 userId 作为参与者。
// 非单聊或格式异常时返回仅发送者,避免误建无关用户的会话关系。
export function deriveParticipants(conversationId: string, senderId: bigint): bigint[] {
  const parts = conversationId.split('_');
  if (parts[0] === 'single' && parts.length >= 3) {
    const ids = [parts[1], parts[2]]
      .filter((p) => /^\d+$/.test(p))
      .map((p) => BigInt(p));
    if (ids.length === 2) return ids;
  }
  return [senderId];
}
