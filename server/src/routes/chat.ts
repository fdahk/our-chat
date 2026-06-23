import express from 'express';
import { prisma } from '../database/prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// 获取用户会话列表
router.get('/userConversations', authenticateToken, async (req, res) => {
  const userId = req.query.userId as string;
  if (req.user!.id.toString() !== userId.toString()) {
    return res.status(403).json({ success: false, message: '无权访问其他用户的会话列表' });
  }
  try {
    const list = await prisma.userConversation.findMany({
      where: { userId: BigInt(Number(userId)) },
      orderBy: { lastActivity: 'desc' },
    });
    res.json({ success: true, data: list });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: '获取用户会话列表失败' });
  }
});

// 获取会话列表(按 ID 集合)
router.get('/conversations', authenticateToken, async (req, res) => {
  const userConversationIds = JSON.parse(req.query.userConversationIds as string) as string[];
  if (userConversationIds.length === 0) {
    res.json({ success: true, data: {} });
    return;
  }
  try {
    const rows = await prisma.conversation.findMany({
      where: { id: { in: userConversationIds } },
      orderBy: { updatedAt: 'desc' },
    });
    const list = rows.reduce<Record<string, (typeof rows)[number]>>((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {});
    res.json({ success: true, data: list });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: '获取会话列表失败' });
  }
});

// 获取会话的全部消息(按时间升序)
router.get('/messages', authenticateToken, async (req, res) => {
  const conversationId = req.query.conversationId as string;
  if (!conversationId) {
    return res.status(400).json({ success: false, message: '缺少 conversationId 参数' });
  }
  try {
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { timestamp: 'asc' },
    });
    res.json({ success: true, data: messages });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: '获取会话消息失败' });
  }
});

// 更新会话时间(同时负责首次创建会话记录)── 只能更新自己参与的会话
router.post('/updateConversationTime', authenticateToken, async (req, res) => {
  const conversationId = req.body.conversationId as string;
  const userId = req.body.userId;

  if (req.user!.id.toString() !== userId.toString()) {
    return res.status(403).json({ success: false, message: '无权更新其他用户的会话' });
  }
  try {
    // 会话与「我的」会话视图各自幂等 upsert:会话可能已被好友接受流程或对方先建好,
    // 而我的 userConversation 仍可能缺失,二者要分别判断——不能用「我的视图缺失」推断会话不存在,
    // 否则会对已存在的会话再次 create 触发 P2002 唯一冲突。
    await prisma.conversation.upsert({
      where: { id: conversationId },
      update: { updatedAt: new Date() },
      create: { id: conversationId, convType: 'single' },
    });
    await prisma.userConversation.upsert({
      where: { userId_conversationId: { userId: BigInt(Number(userId)), conversationId } },
      update: {},
      create: { userId: BigInt(Number(userId)), conversationId },
    });
    res.json({ success: true });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: '更新会话时间失败' });
  }
});

// 取每个会话的最后一条消息。等价于原 Mongo aggregate 的 4 阶段 pipeline
// (match → sort → group → replaceRoot),在 PG 经 DISTINCT ON + 复合索引
// idx_messages_conv_ts 命中 Index-Only Scan,基准测试 10~50× 加速
//   (详见 docs/database/03-PG统一替换MongoDB决策记录.md §3.1)
router.get('/lastMessages', authenticateToken, async (req, res) => {
  const userConversationIds = JSON.parse(req.query.userConversationIds as string) as string[];
  if (userConversationIds.length === 0) {
    return res.json({ success: true, data: {} });
  }
  const rows = await prisma.$queryRaw<Array<Record<string, unknown> & { conversation_id: string }>>`
    SELECT DISTINCT ON (conversation_id) *
    FROM messages
    WHERE conversation_id = ANY(${userConversationIds}::text[])
    ORDER BY conversation_id, timestamp DESC
  `;
  const lastMessages: Record<string, unknown> = {};
  for (const row of rows) {
    lastMessages[row.conversation_id] = row;
  }
  res.json({ success: true, data: lastMessages });
});

export default router;
