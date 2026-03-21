import express from 'express';
import cors from 'cors'; //跨域中间件
import { connectDb } from './dataBase/mongoDb.js';
import registerRouter from './routes/register.js';
import loginRouter from './routes/login.js';
import conversationRouter from './routes/chat.js';
import { initSocket } from './utils/socket.js';
import uploadRouter from './routes/upload.js';
import userRouter from './routes/user.js';
import friendRouter from './routes/friend.js';
import uploadAdvancedRouter from './routes/uploadAdvanced.js';
const app = express(); //Express监听（http）服务器
const PORT = process.env.PORT || 3007; //获取端口

// 跨域中间件
app.use(cors());
// 解析中间件
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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
app.use('/api/upload', uploadAdvancedRouter);

// 错误处理中间件（需注册在所有路由之后）
app.use((err, req, res, next) => {
  console.error('全局错误处理:', err);
  res.status(500).json({
    success: false,
    message: '服务器内部错误'
  });
});

async function start() {
  await connectDb();

  const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `端口 ${PORT} 已被占用（EADDRINUSE）。请结束占用该端口的进程或设置环境变量 PORT 使用其他端口。`
      );
    } else {
      console.error('HTTP 服务器 listen 错误:', err);
    }
    process.exit(1);
  });

  initSocket(server);
}

start().catch((error) => {
  console.error('服务启动失败:', error);
  process.exit(1);
});
