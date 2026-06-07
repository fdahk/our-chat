import { post } from '@/utils/http';
import { type LoginFormModel } from './type';
import type { User } from '@/globalType/user';

// 登录成功响应体只含用户信息，token 走 HttpOnly cookie，不再回传给前端
type LoginResponse = User;

// 登录API
export const loginApi = async (loginForm: LoginFormModel) => {
    return post<LoginResponse>('/api/login', {
        username: loginForm.username,
        password: loginForm.password,
        remember: loginForm.remember,
    });
};
