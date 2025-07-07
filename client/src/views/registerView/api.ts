import { post, get } from '@/utils/http';
import { type RegisterData, type RegisterResponse } from './type';


// 注册API
export const registerUser = async (userData: RegisterData) => {
  return post<RegisterResponse>('/api/register', {
    username: userData.username,
    email: userData.email,
    password: userData.password,
    phone: userData.phone || null,
    nickname: userData.nickname || userData.username,
    avatar: userData.avatar || '',
    bio: userData.bio || '',
    status: 'online',
  });
};

// 检查用户名是否已存在
export const checkUsernameExists = async (username: string): Promise<boolean> => {
  try {
    const result = await get<{ exists: boolean }>(`/api/check-username?username=${encodeURIComponent(username)}`);
    return result.data?.exists || false;
  } catch (error) {
    console.error('检查用户名失败:', error);
    return false;
  }
};

// 检查邮箱是否已存在
export const checkEmailExists = async (email: string): Promise<boolean> => {
  try {
    const result = await get<{ exists: boolean }>(`/api/check-email?email=${encodeURIComponent(email)}`);
    return result.data?.exists || false;
  } catch (error) {
    console.error('检查邮箱失败:', error);
    return false;
  }
};

// 检查手机号是否已存在
export const checkPhoneExists = async (phone: string): Promise<boolean> => {
  try {
    const result = await get<{ exists: boolean }>(`/api/check-phone?phone=${encodeURIComponent(phone)}`);
    return result.data?.exists || false;
  } catch (error) {
    console.error('检查手机号失败:', error);
    return false;
  }
};
