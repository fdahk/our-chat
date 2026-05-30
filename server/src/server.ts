import app from './app.js';
import { connectDb } from './database/mongoDB.js';
import { initSocket } from './utils/socket.js';

const PORT = process.env.PORT || 3007; //获取端口

async function start(): Promise<void> {
  await connectDb();

  const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
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
