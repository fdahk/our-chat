import express from 'express';
const router = express.Router(); 
import { mySql } from '../dataBase/mySql.js';
import { Message } from '../dataBase/mongoDb.js';

// 获取会话列表
router.get('/conversation', async (req, res) => {
    const userId = req.query.userId;
    try {
        const [list] = await mySql.execute(
            `SELECT * FROM conversations
             WHERE id LIKE ? OR id LIKE ?
             ORDER BY updated_at DESC`,
            [
                `single_${userId}_%`,
                `single_%_${userId}`,
            ]
        );
        res.json({ success: true, data: list });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: '获取对话失败' });
    }
});

// 获取所有会话消息（MongoDB）
router.get('/conversation/messages', async (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
        return res.status(400).json({ success: false, message: '缺少 userId 参数' });
    }
    try {
        // 匹配 _2_（中间）、_2（结尾）、2_（开头）
        const regex = new RegExp(`(_${userId}_|_${userId}$|^${userId}_)`);
        const messages = await Message.find({ conversationId: { $regex: regex } })
            .sort({ timestamp: 1 }) // 按时间排序，从旧到新
            .lean();
        // 处理数据格式，返回数据结构为 { [conversationId: string]: Message[] , ... }
        const newMessages = messages.reduce((acc, item) => {
            acc[item.conversationId] = [...(acc[item.conversationId] || []), item];
            return acc;
        }, {});
        // console.log(newMessages); // 调试
        res.json({ success: true, data: newMessages });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: '获取对话消息失败' });
    }
});

export default router;