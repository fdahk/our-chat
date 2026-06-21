import { rateLimit } from 'express-rate-limit';

// 认证端点限流(登录/注册):按客户端 IP 计数,超阈值返回 429,缓解撞库/暴力破解。
// 注意:多副本部署时这是「每副本」内存计数,如需全局精确需换 Redis store;
// 单副本/中小流量下已能显著抬高爆破成本。窗口/阈值可经 env 调整。
export const authRateLimiter = rateLimit({
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000),
  limit: Number(process.env.AUTH_RATE_LIMIT_MAX ?? 10),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: '尝试过于频繁,请稍后再试' },
});
