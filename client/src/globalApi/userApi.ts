import {post} from '@/utils/http'; 
import type { User } from '@/globalType/user';

export const updateUserInfo = (data: Partial<User>) => {
    return post<void, Partial<User>>('/user/update', data);
}

