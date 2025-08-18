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
        console.log('用户连接:', socket.id);

        // 用户加入房间
        socket.on('join', (userId) => {
            socket.join(userId);
            console.log(`用户 ${userId} 加入房间`);
        });

        // 消息处理 (保持原有逻辑)
        socket.on('sendMessage', async (msg) => {
            try {
                const splited = msg.conversationId.split('_');
                const user1 = splited[1];
                const user2 = splited[2];            
                
                const savedMsg = await Message.create(msg);
                console.log('消息保存成功:', savedMsg._id);
                
                // 检查并创建用户会话记录
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
                io.to(parseInt(user1)).emit('receiveMessage', savedMsg);
                io.to(parseInt(user2)).emit('receiveMessage', savedMsg);      
                console.log('消息广播成功');          
                
            } catch (err) {
                console.error('消息处理失败:', err);
                socket.emit('error', { message: '消息发送失败' });
            }
        });

        // 好友请求处理 (保持原有逻辑)
        socket.on('sendFriendReq', async (friendReq) => {
            try {
                console.log('转发好友请求:', friendReq);
                io.to(friendReq.user_id).emit('receiveFriendReq', friendReq);
            } catch (error) {
                console.error('转发好友请求失败:', error);
            }
        });

        // 简化的语音通话事件处理

        // 通话发起 (包含offer)
        socket.on('call:start', (event) => {
            try {
                console.log('转发通话邀请:', {
                    callId: event.callId,
                    from: event.from.username,
                    to: event.to.username
                });
                
                // 转发给目标用户
                io.to(event.to.id).emit('call:start', event);
                console.log('通话邀请转发成功');
                
            } catch (error) {
                console.error('转发通话邀请失败:', error);
            }
        });

        // 通话接受 (包含answer)
        socket.on('call:accept', (event) => {
            try {
                console.log('转发通话接受:', event.callId);
                
                // 转发给发起方 (event.to就是发起方ID)
                io.to(event.to).emit('call:accept', event);
                console.log('通话接受转发成功');
                
            } catch (error) {
                console.error('转发通话接受失败:', error);
            }
        });

        // 通话拒绝
        socket.on('call:reject', (event) => {
            try {
                console.log('转发通话拒绝:', event.callId);
                
                // 从callId解析发起方ID
                const callIdParts = event.callId.split('_');
                if (callIdParts.length >= 3) {
                    const callerId = parseInt(callIdParts[1]);
                    io.to(callerId).emit('call:reject', event);
                    console.log('通话拒绝转发成功给用户:', callerId);
                }
                
            } catch (error) {
                console.error('转发通话拒绝失败:', error);
            }
        });

        // 通话结束
        socket.on('call:end', (event) => {
            try {
                console.log('转发通话结束:', event.callId);
                
                // 广播给双方 (从callId解析用户ID)
                const [, user1, user2] = event.callId.split('_');
                io.to(parseInt(user1)).emit('call:end', event);
                io.to(parseInt(user2)).emit('call:end', event);
                console.log('通话结束转发成功');
                
            } catch (error) {
                console.error('转发通话结束失败:', error);
            }
        });

        // ICE候选交换 - 修复版本
        socket.on('call:ice', (event) => {
            try {
                console.log('转发ICE候选:', event.callId);
                
                // 从callId解析双方用户ID
                const [, user1, user2] = event.callId.split('_');
                const userId1 = parseInt(user1);
                const userId2 = parseInt(user2);
                
                // 转发给双方（不包括发送方自己）
                // 注意：socket.to() 不包括当前socket，io.to() 包括
                io.to(userId1).emit('call:ice', event);
                io.to(userId2).emit('call:ice', event);
                
                console.log(`ICE候选转发给用户: ${userId1}, ${userId2}`);
                
            } catch (error) {
                console.error('转发ICE候选失败:', error);
            }
        });

        // 断开连接
        socket.on('disconnect', () => {
            console.log('用户断开连接:', socket.id);
        });
    });
}  