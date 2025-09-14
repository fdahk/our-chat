import express from 'express';
import { mySql } from '../dataBase/mySql.js';
import { authenticateToken, checkResourceOwner } from '../middleware/auth.js';
const router = express.Router();
// 更新用户信息 - 需要认证且只能更新自己的信息
router.post('/update', authenticateToken, async (req, res) => {
    const { id, ...data } = req.body
    
    // 验证用户只能更新自己的信息
    if (req.user.id.toString() !== id.toString()) {
        return res.status(403).json({ 
            success: false, 
            message: '无权修改其他用户信息' 
        });
    }
    try {
        if(!id) {
            return res.status(400).json({ message: 'id不能为空' });
        }
        const sql = `UPDATE users SET ? WHERE id = ?`;
        const [result] = await mySql.query(sql, [data, id]);
        if(result.affectedRows === 0) {
            console.log('更新失败400');
            return res.status(400).json({ message: '更新失败' });
        }
        res.status(200).json({ message: '更新成功' });
    } catch (error) {
        res.status(500).json({ message: '更新失败500' });
        console.log(error);
    }
});

export default router;