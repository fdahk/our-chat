import  { useState } from 'react';
// 引入antd组件
import { 
  Form, 
  Input, 
  Button, 
  Card, 
  Typography, 
  Space, 
  Divider,
  message,
  Checkbox
} from 'antd';
// 引入antd图标
import { 
  UserOutlined, 
  LockOutlined, 
  EyeInvisibleOutlined, 
  EyeTwoTone,
  LoginOutlined 
} from '@ant-design/icons';
// 引入redux
import { useDispatch } from 'react-redux';
import { loginApi } from './api.ts';
import  { login } from '../../store/userStore'; // 数据类型检查
import styles from './index.module.scss';
import { useNavigate } from 'react-router-dom';
import { type LoginForm } from './type';

const { Title, Text } = Typography;

function LoginView() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleLogin = async (values: LoginForm) => {
    setLoading(true);
    try {
      const result = await loginApi({
        username: values.username,
        password: values.password,
        remember: values.remember,
      });
      console.log(result);
      // 存储token到本地
      localStorage.setItem('token', result.data.token);
      // 存储用户信息到 redux
      dispatch(login({
        id: result.data.id,
        username: result.data.username,
        nickname: result.data.nickname,
        email: result.data.email,
        avatar: result.data.avatar,
        bio: result.data.bio,
        phone: result.data.phone,
        status: result.data.status,
        created_at: result.data.created_at,
        updated_at: result.data.updated_at,
        last_seen: result.data.last_seen,
      }));

      // 跳转到主页
      navigate('/chat');
    } catch (error) {
      message.error('登录失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleLoginFailed = (errorInfo: any) => {
    console.log('登录失败:', errorInfo);
    message.error('请检查输入信息');
  };

  const handleRegister = () => {
    navigate('/register');
  };

  return (
    <div className={styles.loginContainer}>
      <Card className={styles.loginCard}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {/* 标题区域 */}
          <div className={styles.header}>
            <Title level={2} style={{ textAlign: 'center', marginBottom: 8 }}>
              欢迎回来
            </Title>
            <Text type="secondary" style={{ display: 'block', textAlign: 'center' }}>
              登录到我们的聊天
            </Text>
          </div>

          {/* 登录表单 */}
          <Form
            form={form}
            name="login"
            onFinish={handleLogin}
            onFinishFailed={handleLoginFailed}
            autoComplete="off"
            layout="vertical"
            size="large"
          >
            <Form.Item
              name="username"
              rules={[
                { required: true, message: '请输入用户名!' },
                { min: 3, message: '用户名至少3个字符!' }
              ]}
            >
              <Input 
                prefix={<UserOutlined />}
                placeholder="用户名"
                allowClear
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[
                { required: true, message: '请输入密码!' },
                { min: 6, message: '密码至少6个字符!' }
              ]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="密码"
                iconRender={visible =>
                  visible
                    ? <EyeTwoTone twoToneColor="#07c160" /> //双色图标，只用style无效，且不支持css变量
                    : <EyeInvisibleOutlined />
                }
              />
            </Form.Item>

            <Form.Item>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Form.Item name="remember" valuePropName="checked" noStyle>
                  <Checkbox>记住我</Checkbox>
                </Form.Item>
                <Button type="link" style={{ padding: 0 }}>
                  忘记密码？
                </Button>
              </div>
            </Form.Item>

            <Form.Item>
              <Button 
                type="primary" 
                htmlType="submit" 
                block 
                loading={loading}
                icon={<LoginOutlined />}
              >
                {loading ? '登录中...' : '登录'}
              </Button>
            </Form.Item>
          </Form>

          <Divider>其他登录方式</Divider>

          {/* 第三方登录 */}
          <Space direction="vertical" style={{ width: '100%' }}>
            <Button block icon={<i className="iconfont icon-wechat-fill" />}>
              微信登录
            </Button>
            <Button block icon={<i className="iconfont icon-QQ-circle-fill" />}>
              QQ登录
            </Button>
          </Space>

          {/* 注册链接 */}
          <div style={{ textAlign: 'center' }}>
            <Text type="secondary">
              还没有账号？{' '}
              <Button type="link" style={{ padding: 0 }} onClick={handleRegister}>
                立即注册
              </Button>
            </Text>
          </div>
        </Space>
      </Card>
    </div>
  );
}

export default LoginView;
