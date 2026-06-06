import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { prisma } from '../database/prisma.js';
import { config } from '../config/config.js';
import {
  setAuthCookies,
  clearAuthCookies,
  generateCsrfToken,
  CSRF_COOKIE,
  TOKEN_COOKIE,
  REMEMBER_MAX_AGE,
  SESSION_MAX_AGE,
} from '../utils/authCookies.js';
const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password, remember } = req.body;
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) return res.status(400).json({ success: false, message: '用户不存在' });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(400).json({ success: false, message: '密码错误' });

  // 勾选记住我签发 7 天，否则 1 小时；cookie maxAge 与之对齐
  const expiresIn = remember ? config.jwtExpiresIn : '1h';
  const maxAge = remember ? REMEMBER_MAX_AGE : SESSION_MAX_AGE;
  const token = jwt.sign(
    { id: Number(user.id), username: user.username },
    config.jwtSecret,
    { expiresIn } as jwt.SignOptions,
  );

  // token 写入 HttpOnly cookie（前端 JS 读不到），并下发可读的 csrf token
  const csrfToken = generateCsrfToken();
  setAuthCookies(res, token, csrfToken, maxAge);

  // 响应体只返回用户信息，绝不再回传 token（剔除密码）
  const { password: _password, ...userInfo } = user;
  res.json({ success: true, data: userInfo });
});

// Token刷新接口：基于现有 cookie 重签并重设 cookie
router.post('/refresh', async (req, res) => {
  try {
    const token = req.cookies?.[TOKEN_COOKIE];
    if (!token) {
      return res.status(401).json({ success: false, message: '缺少刷新令牌' });
    }

    // 双提交 CSRF 校验（刷新是变更类请求）
    const headerCsrf = req.headers['x-csrf-token'];
    const cookieCsrf = req.cookies?.[CSRF_COOKIE];
    if (!cookieCsrf || !headerCsrf || headerCsrf !== cookieCsrf) {
      return res.status(403).json({ success: false, message: 'CSRF 校验失败' });
    }

    // 验证token（即使过期也要能解析出用户信息）
    let decoded: any;
    try {
      decoded = jwt.verify(token, config.jwtSecret);
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        decoded = jwt.decode(token);
      } else {
        return res.status(401).json({ success: false, message: 'Token无效' });
      }
    }

    if (!decoded || !decoded.id) {
      return res.status(401).json({ success: false, message: 'Token格式错误' });
    }

    // 验证用户是否仍然存在
    const user = await prisma.user.findFirst({
      where: { id: BigInt(decoded.id), NOT: { status: 'deleted' } },
      select: { id: true, username: true, email: true, nickname: true, avatar: true, status: true },
    });

    if (!user) {
      return res.status(401).json({ success: false, message: '用户不存在或已被禁用' });
    }

    // 重签并重设 cookie（默认续 1 小时），同时轮换 csrf token
    const newToken = jwt.sign(
      { id: Number(user.id), username: user.username },
      config.jwtSecret,
      { expiresIn: '1h' }
    );
    setAuthCookies(res, newToken, generateCsrfToken(), SESSION_MAX_AGE);

    res.json({ success: true, data: { user }, message: 'Token刷新成功' });
  } catch (error) {
    console.error('Token刷新失败:', error);
    res.status(500).json({ success: false, message: '服务器内部错误' });
  }
});

// 登出：清除鉴权 cookie
router.post('/logout', (_req, res) => {
  clearAuthCookies(res);
  res.json({ success: true, message: '已登出' });
});

export default router;
