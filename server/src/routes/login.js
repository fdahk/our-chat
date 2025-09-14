import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { mySql } from '../dataBase/mySql.js';
import { config } from '../config/config.js';
const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password, remember } = req.body;
  // 用户名登录，后期再来扩展
  const [rows] = await mySql.execute(
    'SELECT * FROM users WHERE username=? LIMIT 1',
    [username]
  );
  const user = rows[0];
  if (!user) return res.status(400).json({ success: false, message: '用户不存在' });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(400).json({ success: false, message: '密码错误' });

  // 生成JWT,勾选记住我就设置7天过期，否则设置1小时过期
  let token = '';
  if(remember) {
    // 参数： 1. payload 2. 密钥 3. 过期时间
    // iat	JWT库自动添加	当前时间戳，记录签发时间
    // exp	JWT库自动计算	根据expiresIn计算的过期时间
    token = jwt.sign({ id: user.id, username: user.username }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
  } else {
    token = jwt.sign({ id: user.id, username: user.username }, config.jwtSecret, { expiresIn: '1h' });
    // res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 24 * 7 });
  }
  console.log('token', token);
  user.token = token;
  // 返回用户信息(剔除密码)
  const { password: _, ...userInfo } = user;
  res.json({ success: true, data: userInfo});
});

// Token刷新接口
router.post('/refresh', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: '缺少刷新令牌'
      });
    }

    // 验证token（即使过期也要能解析出用户信息）
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwtSecret);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        // Token过期，但仍可以解析出用户信息
        decoded = jwt.decode(token);
      } else {
        return res.status(401).json({
          success: false,
          message: 'Token无效'
        });
      }
    }

    if (!decoded || !decoded.id) {
      return res.status(401).json({
        success: false,
        message: 'Token格式错误'
      });
    }

    // 验证用户是否仍然存在
    const [rows] = await mySql.execute(
      'SELECT id, username, email, nickname, avatar, status FROM users WHERE id = ? AND status != "deleted"',
      [decoded.id]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: '用户不存在或已被禁用'
      });
    }

    const user = rows[0];

    // 生成新的token（默认1小时有效期）
    const newToken = jwt.sign(
      { id: user.id, username: user.username },
      config.jwtSecret,
      { expiresIn: '1h' }
    );

    res.json({
      success: true,
      data: {
        token: newToken,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          nickname: user.nickname,
          avatar: user.avatar,
          status: user.status
        }
      },
      message: 'Token刷新成功'
    });

  } catch (error) {
    console.error('Token刷新失败:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误'
    });
  }
});

export default router;