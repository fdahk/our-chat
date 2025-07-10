import express from 'express';
const router = express.Router(); 
import { mySql } from '../dataBase/mySql.js';
import { Message } from '../dataBase/mongoDb.js';

// 获取会话列表
router.get('/conversation', async (req, res) => {
    const userId = req.query.userId;
    try {
        const [list] = await mySql.execute(
            `SELECT * FROM user_conversations
             WHERE user_id = ?
             ORDER BY updated_at DESC`,
            [userId]
        );
        res.json({ success: true, data: list });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: '获取对话失败' });
    }
});

// 获取会话的消息（MongoDB）
router.get('/conversation/messages', async (req, res) => {
    const conversationId = req.query.conversationId;
    if (!conversationId) {
        return res.status(400).json({ success: false, message: '缺少 conversationId 参数' });
    }
    try {
        const messages = await Message.find({ conversationId: conversationId })
            .sort({ timestamp: 1 }) // 按时间排序，从旧到新
            .lean();
        res.json({ success: true, data: messages });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: '获取对话消息失败' });
    }
});

export default router;