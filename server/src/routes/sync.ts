import express from 'express';
import { prisma } from '../database/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import { syncQuery, readReportInput } from '../contracts/message.js';

const router = express.Router();

const SYNC_MAX_LIMIT = 200;
const SYNC_DEFAULT_LIMIT = 50;

// 成员校验:必须是会话参与者才能拉取/上报,防越权读取他人会话(docs 13 §6.2)。
async function isMember(userId: bigint, conversationId: string): Promise<boolean> {
  const row = await prisma.userConversation.findUnique({
    where: { userId_conversationId: { userId, conversationId } },
    select: { id: true },
  });
  return row !== null;
}

// 增量补拉:返回 seq > since 的消息,按 seq 升序分页。命中 idx_messages_conv_seq 做 Index Range Scan。
router.get('/sync', authenticateToken, async (req, res) => {
  const parsed = syncQuery.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: '参数非法', issues: parsed.error.issues });
  }
  const { conv, since, limit } = parsed.data;
  const userId = BigInt(req.user!.id);

  if (!(await isMember(userId, conv))) {
    return res.status(403).json({ success: false, message: '无权拉取该会话' });
  }

  const take = Math.min(limit ? Number(limit) : SYNC_DEFAULT_LIMIT, SYNC_MAX_LIMIT);
  const messages = await prisma.message.findMany({
    where: { conversationId: conv, seq: { gt: BigInt(since) }, isDeleted: false },
    orderBy: { seq: 'asc' },
    take,
  });

  res.json({ success: true, data: { messages, hasMore: messages.length === take } });
});

// 已读上报:单调推进 lastReadSeq(WHERE lastReadSeq < upto),乱序/重复上报不会让位点倒退(docs 13/15)。
router.post('/read', authenticateToken, async (req, res) => {
  const parsed = readReportInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: '参数非法', issues: parsed.error.issues });
  }
  const { conversationId, uptoSeq } = parsed.data;
  const userId = BigInt(req.user!.id);

  if (!(await isMember(userId, conversationId))) {
    return res.status(403).json({ success: false, message: '无权操作该会话' });
  }

  const updated = await prisma.userConversation.updateMany({
    where: { userId, conversationId, lastReadSeq: { lt: uptoSeq } },
    data: { lastReadSeq: uptoSeq },
  });

  res.json({ success: true, data: { advanced: updated.count > 0 } });
});

export default router;
