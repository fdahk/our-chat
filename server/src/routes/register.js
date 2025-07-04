import express from 'express';
import bcrypt from 'bcrypt';
import  {mySql}  from '../dataBase/mySql.js';
const router = express.Router();



// 用户注册接口
router.post('/register', async (req, res) => {
    console.log(req.body);
  try {
    const { username, email, password, phone, nickname, avatar, bio } = req.body;

    // 基本参数验证
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: '用户名、邮箱和密码不能为空'
      });
    }

    // 数据格式验证
    if (username.length < 3 || username.length > 50) {
      return res.status(400).json({
        success: false,
        message: '用户名长度必须在3-50个字符之间'
      });
    }

    if (email.length > 100) {
      return res.status(400).json({
        success: false,
        message: '邮箱地址不能超过100个字符'
      });
    }

    if (password.length < 6 || password.length > 255) {
      return res.status(400).json({
        success: false,
        message: '密码长度必须在6-255个字符之间'
      });
    }

    if (phone && phone.length > 20) {
      return res.status(400).json({
        success: false,
        message: '手机号码不能超过20个字符'
      });
    }

    if (nickname && nickname.length > 50) {
      return res.status(400).json({
        success: false,
        message: '昵称不能超过50个字符'
      });
    }

    if (avatar && avatar.length > 255) {
      return res.status(400).json({
        success: false,
        message: '头像URL不能超过255个字符'
      });
    }

    // 邮箱格式验证
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: '邮箱格式不正确'
      });
    }

    // 手机号格式验证（如果提供）
    if (phone && !/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: '手机号格式不正确'
      });
    }

    // 用户名格式验证
    if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(username)) {
      return res.status(400).json({
        success: false,
        message: '用户名只能包含字母、数字、下划线和中文'
      });
    }

    // 检查用户名是否已存在
    const [existingUsername] = await mySql.execute(
      'SELECT id FROM users WHERE username = ?',
      [username]
    );
    
    if (existingUsername.length > 0) {
      return res.status(409).json({
        success: false,
        message: '用户名已存在'
      });
    }

    // 检查邮箱是否已存在
    const [existingEmail] = await mySql.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );
    
    if (existingEmail.length > 0) {
      return res.status(409).json({
        success: false,
        message: '邮箱已被注册'
      });
    }

    // 如果提供了手机号，检查是否已存在
    if (phone) {
      const [existingPhone] = await mySql.execute(
        'SELECT id FROM users WHERE phone = ?',
        [phone]
      );
      
      if (existingPhone.length > 0) {
        return res.status(409).json({
          success: false,
          message: '手机号已被注册'
        });
      }
    }

    // 密码加密
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 插入新用户到数据库
    console.log(phone);
    const [result] = await mySql.execute(
      `INSERT INTO users (
        username, 
        email, 
        phone, 
        password, 
        nickname, 
        avatar, 
        bio, 
        status, 
        last_seen, 
        created_at, 
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())`,
      [
        username,
        email,
        phone || null,
        hashedPassword,
        nickname || username,
        avatar || '',
        bio || '',
        'online'
      ]
    );

    // 获取刚创建的用户信息（不包含密码）
    const [newUser] = await mySql.execute(
      `SELECT id, username, email, phone, nickname, avatar, bio, status, created_at 
       FROM users WHERE id = ?`,
      [result.insertId]
    );

    // 返回成功响应
    res.status(201).json({
      success: true,
      message: '注册成功',
      data: {
        id: newUser[0].id,
        username: newUser[0].username,
        email: newUser[0].email,
        phone: newUser[0].phone,
        nickname: newUser[0].nickname,
        avatar: newUser[0].avatar,
        bio: newUser[0].bio,
        status: newUser[0].status,
        created_at: newUser[0].created_at
      }
    });

  } catch (error) {
    console.error('注册错误:', error);
    
    // 数据库约束错误处理
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: '用户信息已存在，请检查用户名、邮箱或手机号'
      });
    }
    
    res.status(500).json({
      success: false,
      message: '服务器内部错误，请稍后重试'
    });
  } 
});

// 检查用户名是否存在接口
router.get('/check-username', async (req, res) => {
  try {
    const { username } = req.query;

    if (!username) {
      return res.status(400).json({
        exists: false,
        message: '用户名不能为空'
      });
    }

    if (username.length < 3 || username.length > 50) {
      return res.json({
        exists: false,
        message: '用户名长度必须在3-50个字符之间'
      });
    }

    const [rows] = await mySql.execute(
      'SELECT id FROM users WHERE username = ?',
      [username]
    );
    
    const exists = rows.length > 0;
    
    res.json({
      exists,
      message: exists ? '用户名已存在' : '用户名可用'
    });

  } catch (error) {
    console.error('检查用户名错误:', error);
    res.status(500).json({
      exists: false,
      message: '服务器错误'
    });
  } 
});

// 检查邮箱是否存在接口
router.get('/check-email', async (req, res) => {    
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        exists: false,
        message: '邮箱不能为空'
      });
    }

    if (email.length > 100) {
      return res.json({
        exists: false,
        message: '邮箱地址不能超过100个字符'
      });
    }

    // 邮箱格式验证
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.json({
        exists: false,
        message: '邮箱格式不正确'
      });
    }

    const [rows] = await mySql.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );
    
    const exists = rows.length > 0;
    
    res.json({
      exists,
      message: exists ? '邮箱已被注册' : '邮箱可用'
    });

  } catch (error) {
    console.error('检查邮箱错误:', error);
    res.status(500).json({
      exists: false,
      message: '服务器错误'
    });
  }
});

// 检查手机号是否存在
router.get('/check-phone', async (req, res) => {
  try {
    const { phone } = req.query;
    // 如果手机号为空，则设置为null,配合数据库中的phone字段为null
    if(phone.trim() === ''){
      phone = null;
    }
    if (!phone) {
      return res.status(400).json({
        exists: false,
        message: '手机号不能为空'
      });
    }

    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return res.json({
        exists: false,
        message: '手机号格式不正确'
      });
    }

    const [rows] = await mySql.execute(
      'SELECT id FROM users WHERE phone = ?',
      [phone]
    );
    
    const exists = rows.length > 0;
    
    res.json({
      exists,
      message: exists ? '手机号已被注册' : '手机号可用'
    });

  } catch (error) {
    console.error('检查手机号错误:', error);
    res.status(500).json({
      exists: false,
      message: '服务器错误'
    });
  } 
});

export default router;
