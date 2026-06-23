import express from 'express';
import { prisma } from '../database/prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// 获取好友列表(好友 id + 备注 + 资料)── 只能获取自己的
router.get('/getFriendList/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  if (req.user!.id.toString() !== id.toString()) {
    return res.status(403).json({ success: false, message: '无权访问其他用户的好友列表' });
  }
  try {
    const userBigInt = BigInt(Number(id));
    const friendships = await prisma.friendship.findMany({
      where: { userId: userBigInt },
      select: { friendId: true, remark: true },
    });

    let friendList: {
      friendId: Record<string, string | null>;
      friendInfo: Record<string, { username: string; avatar: string | null; gender: string | null }>;
    } = { friendId: {}, friendInfo: {} };

    if (friendships.length > 0) {
      const friendIds = friendships.map((f) => f.friendId);
      const users = await prisma.user.findMany({
        where: { id: { in: friendIds } },
        select: { id: true, username: true, avatar: true, gender: true },
      });
      friendList = {
        friendId: friendships.reduce<Record<string, string | null>>((acc, f) => {
          acc[String(f.friendId)] = f.remark;
          return acc;
        }, {}),
        friendInfo: users.reduce<Record<string, { username: string; avatar: string | null; gender: string | null }>>((acc, u) => {
          acc[String(u.id)] = { username: u.username, avatar: u.avatar, gender: u.gender };
          return acc;
        }, {}),
      };
    }

    res.json({ success: true, data: friendList });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: '获取好友列表失败' });
  }
});

// 查询用户信息(按 id 或 phone)
router.get('/searchUser', authenticateToken, async (req, res) => {
  const { keyword, userId } = req.query as Record<string, string>;
  try {
    const numericKeyword = Number(keyword);
    const matched = await prisma.user.findFirst({
      where: {
        OR: [
          ...(Number.isFinite(numericKeyword) ? [{ id: BigInt(numericKeyword) }] : []),
          { phone: keyword },
          { username: keyword },
        ],
      },
      select: { id: true, avatar: true, username: true, gender: true },
    });
    if (!matched) {
      return res.json({
        success: false,
        message: '用户不存在',
        data: { exist: false, isFriend: false, friendInfo: null },
      });
    }
    const existing = await prisma.friendship.findUnique({
      where: {
        userId_friendId: {
          userId: BigInt(Number(userId)),
          friendId: matched.id,
        },
      },
    });
    if (existing) {
      return res.json({
        success: false,
        message: '已经是好友',
        data: { exist: true, isFriend: true, friendInfo: matched },
      });
    }
    res.json({ success: true, data: { exist: true, isFriend: false, friendInfo: matched } });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: '查询用户信息失败' });
  }
});

// 发起好友请求(双向写入,以 sent/pending 标记发起方与接收方)
router.put('/addFriend', authenticateToken, async (req, res) => {
  const { userId, friend_id } = req.body;
  if (req.user!.id.toString() !== userId.toString()) {
    return res.status(403).json({ success: false, message: '无权代替其他用户发起好友请求' });
  }
  try {
    await prisma.friendship.createMany({
      data: [
        { userId: BigInt(Number(userId)), friendId: BigInt(Number(friend_id)), status: 'sent' },
        { userId: BigInt(Number(friend_id)), friendId: BigInt(Number(userId)), status: 'pending' },
      ],
    });
    res.json({
      success: true,
      message: '发起好友请求成功',
      data: { isFriend: false, friend_id },
    });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: '发起好友请求失败' });
  }
});

// 更新好友备注 ── 只能改自己对某位好友的备注
router.put('/updateRemark', authenticateToken, async (req, res) => {
  const { userId, friend_id, remark } = req.body;
  if (req.user!.id.toString() !== userId.toString()) {
    return res.status(403).json({ success: false, message: '无权修改其他用户的好友备注' });
  }
  try {
    await prisma.friendship.update({
      where: {
        userId_friendId: {
          userId: BigInt(Number(userId)),
          friendId: BigInt(Number(friend_id)),
        },
      },
      data: { remark: typeof remark === 'string' && remark.trim() ? remark.trim() : null },
    });
    res.json({ success: true });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: '更新好友备注失败' });
  }
});

// 获取自己收到的好友请求
router.get('/getFriendReqs', authenticateToken, async (req, res) => {
  const { userId } = req.query as Record<string, string>;
  if (req.user!.id.toString() !== userId.toString()) {
    return res.status(403).json({ success: false, message: '无权访问其他用户的好友请求' });
  }
  try {
    const rows = await prisma.friendship.findMany({
      where: { userId: BigInt(Number(userId)) },
      orderBy: { updatedAt: 'desc' },
    });
    // 请求方资料随请求一起返回:好友请求列表里对方多半还不是好友,本地 friendInfo 取不到,
    // 不带上 username/avatar 的话该卡片会渲染成空白(无名无头像)。
    const requesterIds = rows.map((r) => r.friendId);
    const requesters = requesterIds.length
      ? await prisma.user.findMany({
          where: { id: { in: requesterIds } },
          select: { id: true, username: true, avatar: true },
        })
      : [];
    const requesterMap = new Map(requesters.map((u) => [String(u.id), u]));
    const result = rows.reduce<Record<string, unknown>>((acc, r) => {
      const u = requesterMap.get(String(r.friendId));
      acc[String(r.friendId)] = { ...r, username: u?.username ?? null, avatar: u?.avatar ?? null };
      return acc;
    }, {});
    res.json({ success: true, data: result });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: '获取好友请求失败' });
  }
});

// 回复好友请求,双向更新状态;accepted 时创建 single 会话
router.put('/replyFriendReq', authenticateToken, async (req, res) => {
  const { userId, friend_id, status } = req.body;
  if (req.user!.id.toString() !== userId.toString()) {
    return res.status(403).json({ success: false, message: '无权代替其他用户回复好友请求' });
  }
  try {
    if (status === 'accepted') {
      const conversationId = `single_${Math.min(userId, friend_id)}_${Math.max(userId, friend_id)}`;
      // 如果会话已存在则跳过(P2002 唯一冲突),整体过程仍 success
      await prisma.conversation
        .create({ data: { id: conversationId, convType: 'single' } })
        .catch(() => undefined);
    }
    await prisma.friendship.updateMany({
      where: { userId: BigInt(Number(userId)), friendId: BigInt(Number(friend_id)) },
      data: { status },
    });
    await prisma.friendship.updateMany({
      where: { userId: BigInt(Number(friend_id)), friendId: BigInt(Number(userId)) },
      data: { status },
    });
    res.json({ success: true, message: '回复好友请求成功' });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: '回复好友请求失败' });
  }
});

export default router;
