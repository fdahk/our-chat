import { Server } from 'socket.io'; //基于WebSocket的实时通信库
import { Message } from '../dataBase/mongoDb.js';
import { mySql } from '../dataBase/mySql.js';
export const initSocket = (server) => {
    //创建WebSocket服务器，连接的建立依赖http，WebSocket的握手（连接建立）阶段，先通过http，然后升级为 WebSocket
    const io = new Server(server, {
        cors: {
        // 即使都是本机，localhost 和 127.0.0.1 也会被浏览器视为不同的“源”，可能会有 CORS 跨域限制
        origin: "http://localhost:5173", // 允许前端地址
        methods: ["GET", "POST"],
        credentials: true
        }
    });
    
    // 监听WebSocket连接, 注：第二个参数前端不传默认1socket实例，只能获取到socket.id
    io.on('connection', (socket) => {
        socket.on('join', (userId) => {
        socket.join(userId); // 加入房间
        console.log(`用户 ${userId} 类型 ${typeof userId} 加入房间`);
        });

        // 发送消息
        socket.on('sendMessage', async (msg) => {
        try {
            const splited = msg.conversationId.split('_');
            const user1 = splited[1];
            const user2 = splited[2];            
            // 存储到 MongoDB
            const savedMsg = await Message.create(msg);
            // 检查是否用户删除了用户会话记录，删除了就添加
            const [res1] = await mySql.execute(
                `SELECT * FROM user_conversations WHERE conversation_id = ? AND user_id = ?`,
                [msg.conversationId, user1]
            );
            if (res1.length === 0) {
                await mySql.execute(
                    `INSERT INTO user_conversations (conversation_id, user_id) VALUES (?, ?)`,
                    [msg.conversationId, user1]
                );
            }
            const [res2] = await mySql.execute(
                `SELECT * FROM user_conversations WHERE conversation_id = ? AND user_id = ?`,
                [msg.conversationId, user2]
            );
            if (res2.length === 0) {
                await mySql.execute(
                    `INSERT INTO user_conversations (conversation_id, user_id) VALUES (?, ?)`,
                    [msg.conversationId, user2]
                );
            }
            
            // 广播消息
            try {
                io.to(parseInt(user1)).emit('receiveMessage', savedMsg);
                io.to(parseInt(user2)).emit('receiveMessage', savedMsg);      
                console.log('消息广播成功', typeof user1, typeof user2);          
            } catch (err) {
                console.error('消息广播失败:', err);
            }

        } catch (err) {
            console.error('消息存储失败:', err);
            socket.emit('error', { message: '消息发送失败' });
        }
        });

        // 接收好友请求
        socket.on('sendFriendReq', async (friendReq) => {
            try {
                console.log('发送好友请求', friendReq);
                io.to(friendReq.user_id).emit('receiveFriendReq', friendReq);
            } catch (error) {
                console.error('发送好友请求失败:', error);
            }
        });

        // 断开连接
        socket.on('disconnect', () => {
        console.log('用户断开:', socket.id);
        });
    });
}  