import express from 'express';
import cors from 'cors'; //跨域中间件
import { connectDb } from './dataBase/mongoDb.js';
import registerRouter from './routes/register.js';
import loginRouter from './routes/login.js';
import conversationRouter from './routes/conversation.js';
import { initSocket } from './utils/socket.js';

const app = express(); //Express监听（http）服务器
const PORT = process.env.PORT || 3007; //获取端口

// 跨域中间件
app.use(cors());
// 解析中间件
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
connectDb(); //连接数据库
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

// 路由
app.use('/api', registerRouter);
app.use('/api', loginRouter);
app.use('/user', conversationRouter);

initSocket(server); // 初始化socket.io