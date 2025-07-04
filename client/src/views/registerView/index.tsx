import { useState } from 'react';
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
import { 
  UserOutlined, 
  LockOutlined, 
  MailOutlined,
  PhoneOutlined,
  EyeInvisibleOutlined, 
  EyeTwoTone,
  UserAddOutlined 
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { registerUser, checkUsernameExists, checkEmailExists, checkPhoneExists } from './api';
import styles from './index.module.scss';
import { type RegisterForm } from './type';
const { Title, Text } = Typography;



function RegisterView() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (values: RegisterForm) => {
    setLoading(true);
    // console.log(values.phone || null); // debug
    try {
      // 注册API调用
      const result = await registerUser({
        username: values.username,
        email: values.email,
        password: values.password,
        phone: values.phone || null,
        nickname: values.nickname || values.username,
        avatar: '',
        bio: '',
      });
      
      // 由于响应拦截器已经处理了错误，这里只处理成功情况
      message.success('注册成功！即将跳转到登录页面');
      
      // 清空表单
      form.resetFields();
      
      // 跳转到登录页
      setTimeout(() => {
        navigate('/login');
      }, 1500);
      
    } catch (error) {
      // 错误已经在响应拦截器中处理并显示
      console.error('注册错误:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterFailed = (errorInfo: any) => {
    console.log('注册失败:', errorInfo);
    message.error('请检查输入信息');
  };

  // 用户名唯一性验证
  const validateUsername = async (_: any, value: string) => {
    if (!value) return Promise.resolve();
    
    try {
      const exists = await checkUsernameExists(value);
      if (exists) {
        return Promise.reject(new Error('用户名已存在'));
      }
      return Promise.resolve();
    } catch (error) {
      // 网络错误时不阻止提交
      return Promise.resolve();
    }
  };

  // 邮箱唯一性验证
  const validateEmail = async (_: any, value: string) => {
    if (!value) return Promise.resolve();
    
    try {
      const exists = await checkEmailExists(value);
      if (exists) {
        return Promise.reject(new Error('邮箱已被注册'));
      }
      return Promise.resolve();
    } catch (error) {
      // 网络错误时不阻止提交
      return Promise.resolve();
    }
  };

  const goToLogin = () => {
    navigate('/login');
  };

  return (
    <div className={styles.registerContainer}>
      <Card className={styles.registerCard}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {/* 标题区域 */}
          <div className={styles.header}>
            <Title level={2} style={{ textAlign: 'center', marginBottom: 8 }}>
              创建账号
            </Title>
            <Text type="secondary" style={{ display: 'block', textAlign: 'center' }}>
              加入我们的聊天社区
            </Text>
          </div>

          {/* 注册表单 */}
          <Form
            form={form}
            name="register"
            onFinish={handleRegister}
            onFinishFailed={handleRegisterFailed}
            autoComplete="off"
            layout="vertical"
            size="large"
          >
            <Form.Item
              name="username"
              rules={[
                { required: true, message: '请输入用户名!' },
                { min: 3, message: '用户名至少3个字符!' },
                { max: 50, message: '用户名最多50个字符!' },
                { pattern: /^[a-zA-Z0-9_\u4e00-\u9fa5]+$/, message: '用户名只能包含字母、数字、下划线和中文!' },
                { validator: validateUsername }
              ]}
              hasFeedback
            >
              <Input 
                prefix={<UserOutlined />}
                placeholder="用户名"
                allowClear
              />
            </Form.Item>

            <Form.Item
              name="email"
              rules={[
                { required: true, message: '请输入邮箱地址!' },
                { type: 'email', message: '请输入有效的邮箱地址!' },
                { max: 100, message: '邮箱地址最多100个字符!' },
                { validator: validateEmail }
              ]}
              hasFeedback
            >
              <Input 
                prefix={<MailOutlined />}
                placeholder="邮箱地址"
                allowClear
              />
            </Form.Item>

            <Form.Item
              name="phone"
              rules={[
                { pattern: /^1[3-9]\d{9}$/, message: '请输入有效的手机号码!' },
                { max: 20, message: '手机号码最多20个字符!' }
              ]}
            >
              <Input 
                prefix={<PhoneOutlined />}
                placeholder="手机号码（可选）"
                allowClear
              />
            </Form.Item>

            <Form.Item
              name="nickname"
              rules={[
                { max: 50, message: '昵称最多50个字符!' }
              ]}
            >
              <Input 
                prefix={<UserOutlined />}
                placeholder="昵称（可选，默认为用户名）"
                allowClear
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[
                { required: true, message: '请输入密码!' },
                { min: 6, message: '密码至少6个字符!' },
                { max: 255, message: '密码最多255个字符!' },
                { 
                  pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{6,}$/, 
                  message: '密码必须包含大小写字母和数字!' 
                }
              ]}
              hasFeedback
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="密码"
                iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
              />
            </Form.Item>

            <Form.Item
              name="confirmPassword"
              dependencies={['password']}
              rules={[
                { required: true, message: '请确认密码!' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error('两次输入的密码不一致!'));
                  },
                }),
              ]}
              hasFeedback
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="确认密码"
                iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
              />
            </Form.Item>

            <Form.Item
              name="agreement"
              valuePropName="checked"
              rules={[
                { 
                  validator: (_, value) =>
                    value ? Promise.resolve() : Promise.reject(new Error('请阅读并同意用户协议'))
                }
              ]}
            >
              <Checkbox>
                我已阅读并同意{' '}
                <Button type="link" style={{ padding: 0 }}>
                  用户协议
                </Button>
                {' '}和{' '}
                <Button type="link" style={{ padding: 0 }}>
                  隐私政策
                </Button>
              </Checkbox>
            </Form.Item>

            <Form.Item>
              <Button 
                type="primary" 
                htmlType="submit" 
                block 
                loading={loading}
                icon={<UserAddOutlined />}
              >
                {loading ? '注册中...' : '注册'}
              </Button>
            </Form.Item>
          </Form>

          <Divider>其他注册方式</Divider>

          {/* 第三方注册 */}
          <Space direction="vertical" style={{ width: '100%' }}>
            <Button 
              block 
              icon={<i className="iconfont icon-wechat-fill" />}
              onClick={() => message.info('微信注册功能开发中...')}
            >
              微信注册
            </Button>
            <Button 
              block 
              icon={<i className="iconfont icon-QQ-circle-fill" />}
              onClick={() => message.info('QQ注册功能开发中...')}
            >
              QQ注册
            </Button>
          </Space>

          {/* 登录链接 */}
          <div style={{ textAlign: 'center' }}>
            <Text type="secondary">
              已有账号？{' '}
              <Button type="link" style={{ padding: 0 }} onClick={goToLogin}>
                立即登录
              </Button>
            </Text>
          </div>
        </Space>
      </Card>
    </div>
  );
}

export default RegisterView;