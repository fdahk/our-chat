import { post } from '@/utils/http';
import { type LoginForm } from './type';
import type { User } from '@/globalType/user';

interface LoginResponse extends User {
    token: string;
}

// 登录API
export const loginApi = async (loginForm: LoginForm) => {
    return post<LoginResponse>('/api/login', {
        username: loginForm.username,
        password: loginForm.password,
        remember: loginForm.remember,
    });
};

