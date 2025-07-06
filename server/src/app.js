import express from 'express';
import cors from 'cors'; //跨域中间件
import { connectDB } from './dataBase/mongoDb.js';
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
connectDB(); //连接数据库
// 启动http服务器，app.listen(PORT) 返回一个 http.Server实例，作为WebSocket的参数和webSocket连接
const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

//创建WebSocket服务器，连接的建立依赖http，WebSocket的握手（连接建立）阶段，先通过http，然后升级为 WebSocket
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173", // 允许前端地址
    methods: ["GET", "POST"],
    credentials: true
  }
});

// 路由
app.use('/api', registerRouter);
app.use('/api', loginRouter);
app.use('/user', conversationRouter);
// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('全局错误处理:', err);
  res.status(500).json({
    success: false,
    message: '服务器内部错误'
  });
});

// 监听WebSocket连接
io.on('connection', (socket) => {
  console.log('新用户连接:', socket.id);

  // 发送消息
  socket.on('sendMessage', async (msg) => {
    try {
      // 存储到 MongoDB
      const savedMsg = await Message.create(msg);

      // 广播给会话内所有用户（ conversationId 为房间名）
      io.to(msg.conversationId).emit('receiveMessage', savedMsg);

      // 让发送者自己也收到（没在房间时）
      // socket.emit('receiveMessage', savedMsg);
      console.log('消息存储成功:', savedMsg);
    } catch (err) {
      console.error('消息存储失败:', err);
      socket.emit('error', { message: '消息发送失败' });
    }
  });

  // 加入房间
  socket.on('join', ({ convId }) => {
    socket.join(convId);
    console.log(`用户 ${socket.id} 加入房间 ${convId}`);
  });

  // 离开房间
  socket.on('leave', ({ convId }) => {
    socket.leave(convId);
    console.log(`用户 ${socket.id} 离开房间 ${convId}`);
  });

  // 断开连接
  socket.on('disconnect', () => {
    console.log('用户断开:', socket.id);
  });
});
