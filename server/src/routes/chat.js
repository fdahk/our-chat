import express from 'express';
const router = express.Router(); 
import { mySql } from '../dataBase/mySql.js';
import { Message } from '../dataBase/mongoDb.js';

// 获取用户会话列表
router.get('/userConversations', async (req, res) => {
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
        res.status(500).json({ success: false, message: '获取用户会话列表失败' });
    }
});

// 获取会话列表
router.get('/conversations', async (req, res) => {
    const userConversationIds = req.query.userConversationIds;
    try {
        //注： mysql查询方式的差异
        // execute 方法（预编译/参数化）
        // execute 是严格的预编译语句，IN (?) 只接受一个参数（如 IN (1)），
        // 如果你传数组（如 [1,2,3]），它会把整个数组当成一个字符串参数，变成 IN ('1,2,3')，这不是合法 SQL，导致报错。
        // query 方法（字符串替换）
        // query 方法更“宽松”，它会把数组自动展开成 IN (1,2,3)，所以不会报错。
        // 但这种方式没有参数化保护，有 SQL 注入风险（虽然你用的是 id，风险较低）。
        // 推荐方法：动态拼接占位符
        const placeholders = userConversationIds.map(id => `?`).join(',');
        const [list] = await mySql.execute(
            `SELECT * FROM conversations
             WHERE id IN (${placeholders})
             ORDER BY updated_at DESC`, 
            userConversationIds
        );
        res.json({ success: true, data: list });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: '获取会话列表失败' });
    }
});

// 获取会话的消息（MongoDB）
router.get('/messages', async (req, res) => {
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
        res.status(500).json({ success: false, message: '获取会话消息失败' });
    }
});

// 更新会话时间
router.post('/updateConversationTime', async (req, res) => {
    const conversationId = req.body.conversationId;
    try {
        await mySql.execute(
            `UPDATE conversations SET updated_at = NOW() WHERE id = ?`,
            [conversationId]
        );
        res.json({ success: true }); 
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: '更新会话时间失败' });
    }
});

export default router;