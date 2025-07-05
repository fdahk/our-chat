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
    token = jwt.sign({ id: user.id, username: user.username }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
  } else {
    token = jwt.sign({ id: user.id, username: user.username }, config.jwtSecret, { expiresIn: '1h' });
    // res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 24 * 7 });
  }

  // 返回用户信息(剔除密码)
  const { password: _, ...userInfo } = user;
  res.json({ success: true, data: userInfo, token });
});

export default router;