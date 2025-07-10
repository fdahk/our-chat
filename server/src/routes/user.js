import express from 'express';
import { mySql } from '../dataBase/mySql.js';
const router = express.Router();
// 更新用户信息
router.post('/update', async (req, res) => {
    const { id, ...data } = req.body
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