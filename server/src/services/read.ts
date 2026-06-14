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
