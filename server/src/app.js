import express from 'express';
import cors from 'cors'; //跨域中间件
import { connectDb } from './dataBase/mongoDb.js';
import { Server } from 'socket.io'; //基于WebSocket的实时通信库
import registerRouter from './routes/register.js';
import loginRouter from './routes/login.js';
import conversationRouter from './routes/conversation.js';
import { Message } from './dataBase/mongoDb.js';
const app = express(); //Express监听（http）服务器
const PORT = process.env.PORT || 3007;
// 跨域中间件
app.use(cors());
// 解析中间件
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
connectDb(); //连接数据库
// 启动http服务器，app.listen(PORT) 返回一个 http.Server实例，作为WebSocket的参数和webSocket连接
const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

//创建WebSocket服务器，连接的建立依赖http，WebSocket的握手（连接建立）阶段，先通过http，然后升级为 WebSocket
const io = new Server(server, {
  cors: {
    // 即使都是本机，localhost 和 127.0.0.1 也会被浏览器视为不同的“源”，可能会有 CORS 跨域限制
    origin: "http://localhost:5173", // 允许前端地址
    methods: ["GET", "POST"],
    credentials: true
  }
});


// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('全局错误处理:', err);
  res.status(500).json({
    success: false,
    message: '服务器内部错误'
  });
});

// 路由
app.use('/api', registerRouter);
app.use('/api', loginRouter);
app.use('/user', conversationRouter);

// 监听WebSocket连接, 注：第二个参数前端不传默认1socket实例，只能获取到socket.id
io.on('connection', (socket) => {
  let myUserId = '';
  socket.on('join', (userId) => {
    socket.join(userId); // 加入房间
    console.log(`用户 ${userId} 加入房间`);
    myUserId = userId;
  });
  // 发送消息
  socket.on('sendMessage', async (msg) => {
    try {
      // 存储到 MongoDB
      const savedMsg = await Message.create(msg);
      
      // 广播消息
      const parts = msg.conversationId.split('_'); // 注： 是下划线，卧槽，我真服了
      const senderId = parts[1] === `${msg.senderId}` ? parts[1] : parts[2];
      const receiverId = parts[1] === `${msg.senderId}` ? parts[2] : parts[1];
      io.to(senderId).emit('receiveMessage', savedMsg);
      io.to(receiverId).emit('receiveMessage', savedMsg);
      // console.log('房间成员:', io.sockets.adapter.rooms.get(senderId)); // 调试
      // console.log('消息存储成功:', savedMsg); // 调试
    } catch (err) {
      console.error('消息存储失败:', err);
      socket.emit('error', { message: '消息发送失败' });
    }
  });

  // 断开连接
  socket.on('disconnect', () => {
    console.log('用户断开:', socket.id);
  });
});
