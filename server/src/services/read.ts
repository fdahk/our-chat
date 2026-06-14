import { prisma } from '../database/prisma.js';

// 成员校验:必须是会话参与者才能拉取/上报,防越权(docs 13 §6.2)。
export async function isConversationMember(
  userId: bigint,
  conversationId: string
): Promise<boolean> {
  const row = await prisma.userConversation.findUnique({
    where: { userId_conversationId: { userId, conversationId } },
    select: { id: true },
  });
  return row !== null;
}

// 已读单调推进:仅当上报位点更大时才前移(WHERE lastReadSeq < upto)。
// 乱序/重复上报不会让位点倒退(docs 15 §4.2,坑2)。read 是 per-user 的(任一端读即"已读")。
export async function advanceLastRead(
  userId: bigint,
  conversationId: string,
  uptoSeq: bigint
): Promise<{ advanced: boolean }> {
  const updated = await prisma.userConversation.updateMany({
    where: { userId, conversationId, lastReadSeq: { lt: uptoSeq } },
    data: { lastReadSeq: uptoSeq },
  });
  return { advanced: updated.count > 0 };
}

// 列出某用户「有未读 @」的会话(docs 14 §5.3):mentionSeq > lastReadSeq 即被 @ 后还没读到那条。
// 两列比较 Prisma where 不支持,用原生 SQL;读位点推过 mentionSeq 时该行自然不再返回,无需单独清标。
export async function listMentions(
  userId: bigint
): Promise<Array<{ conversationId: string; mentionSeq: bigint; lastReadSeq: bigint }>> {
  return prisma.$queryRaw`
    SELECT conversation_id AS "conversationId", mention_seq AS "mentionSeq", last_read_seq AS "lastReadSeq"
    FROM user_conversations
    WHERE user_id = ${userId} AND mention_seq > last_read_seq
    ORDER BY mention_seq DESC
  `;
}

// 群已读聚合(docs 14 §4.4/§5.2):只算「读到 seq 的人数」与总成员数,不做逐人逐条已读,
// 规避 N×M 写放大。readCount = lastReadSeq>=seq 的成员行数;total = 会话成员行数。
export async function countReadMembers(
  conversationId: string,
  seq: bigint
): Promise<{ readCount: number; total: number }> {
  const [readCount, total] = await Promise.all([
    prisma.userConversation.count({ where: { conversationId, lastReadSeq: { gte: seq } } }),
    prisma.userConversation.count({ where: { conversationId } }),
  ]);
  return { readCount, total };
}

// per-device 同步态推进:记录某设备在某会话已追平到的 seq(docs 15 §6)。
// ON CONFLICT DO UPDATE + GREATEST 保证单调,避免乱序上报让 synced 倒退。
export async function recordDeviceSync(
  userId: bigint,
  deviceId: string,
  conversationId: string,
  syncedSeq: bigint
): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO device_sync_state (user_id, device_id, conversation_id, last_synced_seq, last_heartbeat)
    VALUES (${userId}, ${deviceId}, ${conversationId}, ${syncedSeq}, now())
    ON CONFLICT (user_id, device_id, conversation_id)
    DO UPDATE SET
      last_synced_seq = GREATEST(device_sync_state.last_synced_seq, EXCLUDED.last_synced_seq),
      last_heartbeat = now()
  `;
}
