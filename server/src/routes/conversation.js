import express from 'express';
const router = express.Router(); 
import { mySql } from '../dataBase/mySql.js';

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

export default router;