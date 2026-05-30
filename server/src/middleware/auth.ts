import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { RowDataPacket } from 'mysql2';
import { config } from '../config/config.js';
import { mySql } from '../database/mySql.js';
import { TOKEN_COOKIE, CSRF_COOKIE } from '../utils/authCookies.js';

interface TokenPayload {
  id: number;
  username: string;
}

interface UserRow extends RowDataPacket {
  id: number;
  username: string;
  email: string | null;
  nickname: string | null;
  avatar: string | null;
  status: string | null;
}

// 读操作不改变状态，无需 CSRF 校验
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// 双提交 CSRF 校验：变更类请求必须带 X-CSRF-Token 头，且与可读的 csrfToken cookie 一致。
// 攻击者站点能让浏览器自动带上 cookie，但读不到 csrfToken 的值，无法伪造这个头。
const verifyCsrf = (req: Request, res: Response): boolean => {
  if (SAFE_METHODS.has(req.method)) return true;
  const headerToken = req.headers['x-csrf-token'];
  const cookieToken = req.cookies?.[CSRF_COOKIE];
  if (!cookieToken || !headerToken || headerToken !== cookieToken) {
    res.status(403).json({ success: false, message: 'CSRF 校验失败，请重新登录' });
    return false;
  }
  return true;
};

// JWT Token验证中间件：从 HttpOnly cookie 读取 token，并对变更类请求做 CSRF 校验
export const authenticateToken: RequestHandler = async (req, res, next) => {
  try {
    if (!verifyCsrf(req, res)) return;

    // 从 HttpOnly cookie 读取访问令牌（不再信任 Authorization 头）
    const token = req.cookies?.[TOKEN_COOKIE];

    if (!token) {
      res.status(401).json({
        success: false,
        message: '访问令牌缺失，请先登录',
      });
      return;
    }

    // 验证token：验证签名、过期时间，解析后获得payload
    const decoded = jwt.verify(token, config.jwtSecret) as TokenPayload;

    // 验证用户是否仍然存在且状态正常
    const [rows] = await mySql.execute<UserRow[]>(
      'SELECT id, username, email, nickname, avatar, status FROM users WHERE id = ? AND status != "deleted"',
      [decoded.id]
    );

    if (rows.length === 0) {
      res.status(401).json({
        success: false,
        message: '用户不存在',
      });
      return;
    }

    // 将用户信息添加到请求对象（数据库现值为准，与 token 内的快照一致）
    req.user = { ...rows[0] } as Express.Request['user'];

    next();
  } catch (error) {
    console.error('Token验证失败:', error);

    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        message: 'Token已过期，请重新登录',
        code: 'TOKEN_EXPIRED',
      });
      return;
    }

    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        success: false,
        message: 'Token无效，请重新登录',
        code: 'TOKEN_INVALID',
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: '服务器内部错误',
    });
  }
};

// 可选的Token验证中间件
export const optionalAuth: RequestHandler = async (req, _res, next) => {
  try {
    const token = req.cookies?.[TOKEN_COOKIE];

    if (!token) {
      req.user = undefined;
      return next();
    }

    const decoded = jwt.verify(token, config.jwtSecret) as TokenPayload;

    const [rows] = await mySql.execute<UserRow[]>(
      'SELECT id, username, email, nickname, avatar, status FROM users WHERE id = ? AND status != "deleted"',
      [decoded.id]
    );

    if (rows.length > 0) {
      req.user = { ...rows[0] } as Express.Request['user'];
    } else {
      req.user = undefined;
    }

    next();
  } catch {
    // 可选验证失败时不阻止请求
    req.user = undefined;
    next();
  }
};

// 检查用户是否为资源所有者
export const checkResourceOwner = (resourceIdField = 'id'): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: '请先登录',
      });
      return;
    }

    const resourceId = req.params[resourceIdField] || req.body[resourceIdField];

    // 如果是用户自己的资源，允许访问
    if (req.user.id.toString() === resourceId.toString()) {
      return next();
    }

    res.status(403).json({
      success: false,
      message: '无权访问此资源',
    });
  };
};
