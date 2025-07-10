import express from 'express';
import cors from 'cors'; //跨域中间件
import { connectDb } from './dataBase/mongoDb.js';
import registerRouter from './routes/register.js';
import loginRouter from './routes/login.js';
import conversationRouter from './routes/conversation.js';
import { initSocket } from './utils/socket.js';
import uploadRouter from './routes/upload.js';
import userRouter from './routes/user.js';
import friendRouter from './routes/friend.js';
const app = express(); //Express监听（http）服务器
const PORT = process.env.PORT || 3007; //获取端口

// 跨域中间件
app.use(cors());
// 解析中间件
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
connectDb(); //连接mongoDb数据库
// 启动http服务器，app.listen(PORT) 返回一个 http.Server实例，作为WebSocket的参数连接http和webSocket
const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('全局错误处理:', err);
  res.status(500).json({
    success: false,
    message: '服务器内部错误'
  });
});

// Express 提供的一个中间件，用于提供静态文件服务，暴露 uploads 目录
// 注：Node里所有相对路径，都是基于“进程启动时的工作目录”来解析的，不是基于当前文件的目录
app.use('/user/uploads', express.static('../uploads'));

// 路由
app.use('/api', registerRouter);
app.use('/api', loginRouter);
app.use('/user', conversationRouter);
app.use('/user/uploads', uploadRouter);
app.use('/user', userRouter);
app.use('/user', friendRouter);
initSocket(server); // 初始化socket.io