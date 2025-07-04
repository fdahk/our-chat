import { post, get } from '../../utils/http';
import { type LoginForm } from './type';

export const login = async (loginForm: LoginForm) => {
    return post('/api/login', {
        username: loginForm.username,
        password: loginForm.password,
        remember: loginForm.remember,
    });
};

