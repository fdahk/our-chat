// dotenv 必须在任何读取 process.env 的模块之前加载:宿主机本地开发读 .env;
// 容器内无 .env 文件时静默跳过,改走 compose 的 environment 注入(已存在的 env 不被覆盖)。
import 'dotenv/config';
import app from './app.js';
import { initSocket } from './utils/socket.js';
import {
  applyPendingMigrations,
  loadKeyStore,
  mountOAuth,
  readIssuerConfigFromEnv,
  readKeyOptionsFromEnv,
  seedDefaultClient,
} from './oauth/index.js';

const PORT = process.env.PORT || 3007;

async function start(): Promise<void> {

  // OAuth IdP 模块:启动时加载 RSA 密钥 + 跑 migration + seed 默认 client。
  // 任一失败立即 fail-fast。端点(/.well-known/* + /oauth/*)在 listen 前挂上,
  // 确保不会出现 "service 启动了但 IdP 暂未就绪" 的窗口
  await applyPendingMigrations();
  await seedDefaultClient();
  const keyStore = await loadKeyStore(readKeyOptionsFromEnv());
  const issuerConfig = readIssuerConfigFromEnv();
  mountOAuth(app, keyStore, issuerConfig);
  console.log(
    `OAuth IdP ready: issuer=${issuerConfig.issuer}, active_kid=${keyStore.active.kid}`,
  );

  const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `端口 ${PORT} 已被占用(EADDRINUSE)。请结束占用该端口的进程或设置环境变量 PORT 使用其他端口。`,
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
