import './database/bigint-json.js';
import express from 'express';
import type { ErrorRequestHandler } from 'express';
import cors from 'cors'; //跨域中间件
import cookieParser from 'cookie-parser';
import registerRouter from './routes/register.js';
import loginRouter from './routes/login.js';
import conversationRouter from './routes/chat.js';
import uploadRouter from './routes/upload.js';
import userRouter from './routes/user.js';
import friendRouter from './routes/friend.js';
import uploadAdvancedRouter from './routes/uploadAdvanced.js';

const app = express(); //Express监听（http）服务器

// 允许携带凭据的来源白名单。来自环境变量 CLIENT_ORIGINS（逗号分隔），
// 开发环境默认放行本机 Vite。注意：启用 cookie 凭据后，CORS 不能再用通配 '*'。
const allowedOrigins = (
  process.env.CLIENT_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,https://localhost:5173,https://127.0.0.1:5173'
)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// 跨域中间件：按白名单校验来源，并允许携带 cookie。
// 无 origin 的请求（同源代理转发、移动端原生、curl）放行。
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`不允许的跨域来源: ${origin}`));
    },
    credentials: true,
  })
);
// 解析 cookie（鉴权 token 从 HttpOnly cookie 读取）
app.use(cookieParser());
// 解析中间件
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Express 提供的一个中间件，用于提供静态文件服务，暴露 uploads 目录
// 注：Node里所有相对路径，都是基于"进程启动时的工作目录"来解析的，不是基于当前文件的目录
app.use('/user/uploads', express.static('../uploads'));

// Health 端点:容器编排健康检查 / load balancer 探针用
// 简单返回 200,不查 DB(避免 DB 抖动时 LB 把所有副本踢下线)。
// 如需 readiness(查 DB 是否可达),可另加 /ready 路由
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// 路由
app.use('/api', registerRouter);
app.use('/api', loginRouter);
app.use('/user', conversationRouter);
app.use('/user/uploads', uploadRouter);
app.use('/user', userRouter);
app.use('/user', friendRouter);
app.use('/api/upload', uploadAdvancedRouter);

// 错误处理中间件（需注册在所有路由之后）
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error('全局错误处理:', err);
  res.status(500).json({
    success: false,
    message: '服务器内部错误',
  });
};
app.use(errorHandler);

export default app;
