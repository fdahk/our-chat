import { post } from '@/utils/http';
import { type LoginForm } from './type';

// 登录API
export const loginApi = async (loginForm: LoginForm) => {
    return post('/api/login', {
        username: loginForm.username,
        password: loginForm.password,
        remember: loginForm.remember,
    });
};

