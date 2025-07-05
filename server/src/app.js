import express from 'express';
import cors from 'cors'; //跨域中间件
import { connectDB } from './dataBase/mongoDB.js';
import { Server } from 'socket.io'; //基于WebSocket的实时通信库
import registerRouter from './routes/register.js';
import loginRouter from './routes/login.js';

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
const io = new Server(server);

// 路由
app.use('/api', registerRouter);
app.use('/api', loginRouter);
// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('全局错误处理:', err);
  res.status(500).json({
    success: false,
    message: '服务器内部错误'
  });
});
