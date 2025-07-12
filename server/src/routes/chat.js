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
    const userConversationIds = JSON.parse(req.query.userConversationIds);
    // 边界处理
    if(userConversationIds.length === 0) {
        res.json({ success: true, data: [] });
        return;
    }
    try {
        //注： mysql查询方式的差异
        // execute 方法（预编译/参数化）
        // execute 是严格的预编译语句，IN (?) 只接受一个参数（如 IN (1)），
        // 如果你传数组（如 [1,2,3]），它会把整个数组当成一个字符串参数，变成 IN ('1,2,3')，这不是合法 SQL，导致报错。
        // query 方法（字符串替换）
        // query 方法更“宽松”，它会把数组自动展开成 IN (1,2,3)，所以不会报错。
        // 但这种方式没有参数化保护，有 SQL 注入风险（虽然你用的是 id，风险较低）。
        // 推荐方法：动态拼接占位符
        // 注：当为空数组时，in() 会被mysql判定为语法错误
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
        const splited = conversationId.split('_')
        const otherConversationId = `single_${parseInt(splited[2])}_${parseInt(splited[1])}`
        const messages = await Message.find({ conversationId: {$in : [conversationId, otherConversationId]} })
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
    const userId = conversationId.split('_')[1];
    try {
        // 注： 单向删除会话记录，存在好友但未必有会话记录
        const [res1] = await mySql.execute(
            `SELECT * FROM user_conversations WHERE conversation_id = ?`,
            [conversationId]
        );
        // 不存在会话记录：先创建会话记录在创建用户会话记录（后者有前者的外键
        if(res1.length === 0) {
            await mySql.execute(
                `INSERT INTO conversations (id,conv_type) VALUES (?,?)`,
                [conversationId,"single"]
            );
            await mySql.execute(
                `INSERT INTO user_conversations (user_id, conversation_id) VALUES (?, ?)`,
                [userId, conversationId]
            );
        }
        // 更新会话时间,注：用户实际获取会话列表是从conversations表获取的
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