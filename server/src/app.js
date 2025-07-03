import express from 'express';
import cors from 'cors'; //跨域中间件
import { connectDB } from './dataBase/index.js';
import { Server } from 'socket.io'; //基于WebSocket的实时通信库



const app = express(); //Express监听（http）服务器
const PORT = 3000;
// 跨域中间件
app.use(cors());
// 解析中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
connectDB(); //连接数据库
// 启动http服务器，app.listen(PORT) 返回一个 http.Server实例，作为WebSocket的参数和webSocket连接
const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

//创建WebSocket服务器，连接的建立依赖http，WebSocket的握手（连接建立）阶段，先通过http，然后升级为 WebSocket
const io = new Server(server);