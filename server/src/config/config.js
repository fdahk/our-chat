import crypto from 'crypto';

const isProduction = process.env.NODE_ENV === 'production';

// JWT 密钥必须来自环境变量，绝不硬编码进源码。
// 生产环境缺失则直接 fail-fast，避免用弱默认值上线；
// 开发环境缺失则随机生成一个，并告警（进程重启后旧 token 会失效，仅用于本地）。
function resolveJwtSecret() {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv && fromEnv.trim()) {
    return fromEnv;
  }
  if (isProduction) {
    throw new Error('缺少环境变量 JWT_SECRET：生产环境必须显式配置 JWT 密钥');
  }
  const generated = crypto.randomBytes(32).toString('hex');
  console.warn(
    '[config] 未设置 JWT_SECRET，已为开发环境生成临时随机密钥；进程重启后已签发的 token 将失效。'
  );
  return generated;
}

export const config = {
  jwtSecret: resolveJwtSecret(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
};

export default config;
