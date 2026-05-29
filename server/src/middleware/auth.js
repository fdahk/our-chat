import jwt from 'jsonwebtoken';
import { config } from '../config/config.js';
import { mySql } from '../dataBase/mySql.js';
import { TOKEN_COOKIE, CSRF_COOKIE } from '../utils/authCookies.js';

// 读操作不改变状态，无需 CSRF 校验
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// 双提交 CSRF 校验：变更类请求必须带 X-CSRF-Token 头，且与可读的 csrfToken cookie 一致。
// 攻击者站点能让浏览器自动带上 cookie，但读不到 csrfToken 的值，无法伪造这个头。
const verifyCsrf = (req, res) => {
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
export const authenticateToken = async (req, res, next) => {
  try {
    if (!verifyCsrf(req, res)) return;

    // 从 HttpOnly cookie 读取访问令牌（不再信任 Authorization 头）
    const token = req.cookies?.[TOKEN_COOKIE];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: '访问令牌缺失，请先登录'
      });
    }

    // 验证token：验证签名、过期时间
    // 解析后获得payload
    const decoded = jwt.verify(token, config.jwtSecret);
    
    // 验证用户是否仍然存在且状态正常
    const [rows] = await mySql.execute(
      'SELECT id, username, email, nickname, avatar, status FROM users WHERE id = ? AND status != "deleted"',
      [decoded.id]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 将用户信息添加到请求对象
    req.user = {
      id: decoded.id,
      username: decoded.username,
      ...rows[0]
    };

    next();
  } catch (error) {
    console.error('Token验证失败:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token已过期，请重新登录',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Token无效，请重新登录',
        code: 'TOKEN_INVALID'
      });
    }

    return res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
};

// 可选的Token验证中间件
export const optionalAuth = async (req, res, next) => {
  try {
    const token = req.cookies?.[TOKEN_COOKIE];

    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = jwt.verify(token, config.jwtSecret);
    
    const [rows] = await mySql.execute(
      'SELECT id, username, email, nickname, avatar, status FROM users WHERE id = ? AND status != "deleted"',
      [decoded.id]
    );

    if (rows.length > 0) {
      req.user = {
        id: decoded.id,
        username: decoded.username,
        ...rows[0]
      };
    } else {
      req.user = null;
    }

    next();
  } catch (error) {
    // 可选验证失败时不阻止请求
    req.user = null;
    next();
  }
};

// 检查用户是否为资源所有者
export const checkResourceOwner = (resourceIdField = 'id') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: '请先登录'
      });
    }

    const resourceId = req.params[resourceIdField] || req.body[resourceIdField];
    
    // 如果是用户自己的资源，允许访问
    if (req.user.id.toString() === resourceId.toString()) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: '无权访问此资源'
    });
  };
};
