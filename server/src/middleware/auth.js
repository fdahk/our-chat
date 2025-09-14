import jwt from 'jsonwebtoken';
import { config } from '../config/config.js';
import { mySql } from '../dataBase/mySql.js';

// JWT Token验证中间件
export const authenticateToken = async (req, res, next) => {
  try {
    // 获取Authorization头
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

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
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

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
