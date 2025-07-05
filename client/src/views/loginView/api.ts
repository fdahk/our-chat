import { post, get } from '../../utils/http';
import { type LoginForm } from './type';

export const loginApi = async (loginForm: LoginForm) => {
    return post('/api/login', {
        username: loginForm.username,
        password: loginForm.password,
        remember: loginForm.remember,
    });
};

