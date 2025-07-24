import express from 'express';
import { mySql } from '../dataBase/mySql.js';
const router = express.Router();
// 获取好友列表及好友信息
router.get('/getFriendList/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const sql = `SELECT friend_id, remark FROM friendships WHERE user_id = ? `; // 注：由于好友申请等多出地方要用的用户信息，这里不设置status
        const [friendId] = await mySql.query(sql, [id]); // 获取好友id列表
        // 依据好友id列表获取好友信息
        let friendInfo = [];
        if(friendId.length > 0) {
            [friendInfo] = await mySql.query(`SELECT id, username, avatar, gender FROM users WHERE id IN (?)`, [friendId.map(item => item.friend_id)]);
        }
        // 合并好友id和好友信息
        let friendList = {
            friendId: {},
            friendInfo: {}
        }
        if(friendId.length > 0) {
            friendList = {
                //注：friendId : [ { friend_id: number, remark: string } ]
                //注：用于用户单向好友管理，（备注、拉黑等
                friendId: friendId.reduce((acc, item) => {
                    acc[item.friend_id] = item.remark;
                    return acc;
                }, {}),
                //注：friendInfo : [ { id: number, username: string, avatar: string } ]
                // 处理后：{ id: { username: string, avatar: string } }
                // 注： 用于渲染好友信息
                friendInfo: friendInfo.reduce((acc, item) => {
                    acc[item.id] = { username: item.username, avatar: item.avatar, gender: item.gender };
                return acc;
                }, {})
            }
        }
    
        res.json({ success: true, data: friendList });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: '获取好友列表失败' });
    }
});
// 查询用户信息
router.get('/searchUser', async (req, res) => {
    const { keyword, userId } = req.query;
    try {
        const sql = `SELECT id,avatar, username, gender FROM users WHERE id = ? OR phone = ?`;
        const [result] = await mySql.query(sql, [keyword, keyword]);
        if (result.length === 0) {
            // 返回id，用于前端处理
            res.json({ success: false, message: '用户不存在', data: { exist: false, isFriend: false, friendInfo: null } });
            return;
        }
        // 检查是否已经是好友
        const sql2 = `SELECT * FROM friendships WHERE user_id = ? AND friend_id = ?`;
        const [result2] = await mySql.query(sql2, [userId, result[0].id]);
        if (result2.length > 0) {
            res.json({ success: false, message: '已经是好友', data: { exist: true, isFriend: true, friendInfo: result[0] } });
            return;
        }
        // null,代表不是好友
        res.json({ success: true, data: { exist: true,isFriend: false, friendInfo: result[0] } });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: '查询用户信息失败' });
    }
});
// 发起好友请求
router.put('/addFriend', async (req, res) => {
    const { userId, friend_id } = req.body;
    try {
        // 插入好友请求
        const sql = `INSERT INTO friendships (user_id, friend_id, status) VALUES (?, ?, ?)`;
        await mySql.query(sql, [userId, friend_id, "sent"]);
        await mySql.query(sql, [friend_id, userId, "pending"]);
        res.json({ success: true, message: '发起好友请求成功', data: { isFriend: false, friend_id: friend_id } });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: '发起好友请求失败' });
    }
});
//获取好友请求 
router.get('/getFriendReqs', async (req, res) => {
    const { userId } = req.query;
    try {
        const sql = `SELECT * FROM friendships WHERE user_id = ? order by updated_at desc`;
        let [result] = await mySql.query(sql, [userId]);
        result = result.reduce((acc, item) => {
            acc[item.friend_id] = item;
            return acc;
        }, {});
        res.json({ success: true, data: result });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: '获取好友请求失败' });
    }
});
//回复好友请求
router.put('/replyFriendReq', async (req, res) => {
    const { userId, friend_id, status } = req.body;
    try {
        if(status === 'accepted') {
            const conversationId = `single_${Math.min(userId, friend_id)}_${Math.max(userId, friend_id)}`;
            const sql = `INSERT INTO conversations (id, conv_type) VALUES (?, ?)`;
            await mySql.query(sql, [conversationId, "single"]);
        }
        const sql = `UPDATE friendships SET status = ? WHERE user_id = ? AND friend_id = ?`;
        await mySql.query(sql, [status, userId, friend_id]);
        await mySql.query(sql, [status, friend_id, userId]);
        res.json({ success: true, message: '回复好友请求成功' });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: '回复好友请求失败' });
    }
});
export default router;
