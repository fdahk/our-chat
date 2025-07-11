import express from 'express';
import { mySql } from '../dataBase/mySql.js';
const router = express.Router();
// 获取好友列表及好友信息
router.get('/getFriendList/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const sql = `SELECT friend_id, remark FROM friendships WHERE user_id = ? AND status = ?`;
        const [friendId] = await mySql.query(sql, [id, "accepted"]); // 获取好友id列表
        // 依据好友id列表获取好友信息
        const [friendInfo] = await mySql.query(`SELECT id, username, avatar, gender FROM users WHERE id IN (?)`, [friendId.map(item => item.friend_id)]);
        // 合并好友id和好友信息
        const friendList = {
            //注：friendId : [ { friend_id: number, remark: string } ]
            //注：用于用户单向好友管理，（备注、拉黑等
            friendId: friendId,
            //注：friendInfo : [ { id: number, username: string, avatar: string } ]
            // 处理后：{ id: { username: string, avatar: string } }
            // 注： 用于渲染好友信息
            friendInfo: friendInfo.reduce((acc, item) => {
                acc[item.id] = { username: item.username, avatar: item.avatar, gender: item.gender };
                return acc;
            }, {})
        }
        res.json({ success: true, data: friendList });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: '获取好友列表失败' });
    }
});

export default router;