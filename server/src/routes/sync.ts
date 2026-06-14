import express from 'express';
import { prisma } from '../database/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import { syncQuery, readReportInput } from '../contracts/message.js';
import {
  isConversationMember,
  advanceLastRead,
  recordDeviceSync,
  listMentions,
  countReadMembers,
} from '../services/read.js';

const router = express.Router();

const SYNC_MAX_LIMIT = 200;
const SYNC_DEFAULT_LIMIT = 50;

// 增量补拉:返回 seq > since 的消息,按 seq 升序分页。命中 idx_messages_conv_seq 做 Index Range Scan。
router.get('/sync', authenticateToken, async (req, res) => {
  const parsed = syncQuery.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: '参数非法', issues: parsed.error.issues });
  }
  const { conv, since, limit, device } = parsed.data;
  const userId = BigInt(req.user!.id);

  if (!(await isConversationMember(userId, conv))) {
    return res.status(403).json({ success: false, message: '无权拉取该会话' });
  }

  const take = Math.min(limit ? Number(limit) : SYNC_DEFAULT_LIMIT, SYNC_MAX_LIMIT);
  const messages = await prisma.message.findMany({
    where: { conversationId: conv, seq: { gt: BigInt(since) }, isDeleted: false },
    orderBy: { seq: 'asc' },
    take,
  });

  // 记录该设备的 per-device synced 位点(docs 15 §6)。取本次拉到的最大 seq 与 since 的较大值,
  // 单调推进。辅助状态,失败不影响补拉响应。
  if (device) {
    const maxSeq = messages.length ? messages[messages.length - 1].seq : BigInt(since);
    void recordDeviceSync(userId, device, conv, maxSeq).catch((err) =>
      console.error('记录 device sync 失败:', err)
    );
  }

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

  if (!(await isConversationMember(userId, conversationId))) {
    return res.status(403).json({ success: false, message: '无权操作该会话' });
  }

  const { advanced } = await advanceLastRead(userId, conversationId, uptoSeq);
  res.json({ success: true, data: { advanced } });
});

// @我:列出当前用户有未读 @ 的会话(mentionSeq > lastReadSeq)。@提醒旁路的查询端,
// 让大群里 @我 的消息能单独高亮/聚合,不被淹没在普通未读里(docs 14 §5.3)。
router.get('/mentions', authenticateToken, async (req, res) => {
  const userId = BigInt(req.user!.id);
  const list = await listMentions(userId);
  res.json({ success: true, data: list });
});

// 群已读人数:返回会话里「已读到 seq」的成员数与总成员数(docs 14 §4.4)。
// 只做聚合不做逐人逐条,规避 N×M 写放大。需是会话成员才可查,防越权窥探群规模。
router.get('/readCount', authenticateToken, async (req, res) => {
  const conv = req.query.conv as string;
  const seqRaw = req.query.seq as string;
  if (!conv || !/^\d+$/.test(seqRaw ?? '')) {
    return res.status(400).json({ success: false, message: '参数非法' });
  }
  const userId = BigInt(req.user!.id);
  if (!(await isConversationMember(userId, conv))) {
    return res.status(403).json({ success: false, message: '无权查看该会话' });
  }
  const result = await countReadMembers(conv, BigInt(seqRaw));
  res.json({ success: true, data: result });
});

export default router;
