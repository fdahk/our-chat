
// Token存储key
const TOKEN_KEY = 'token';
const USER_KEY = 'user';

// 存储token到localStorage
export const setToken = (token: string): void => {
  localStorage.setItem(TOKEN_KEY, token);
};

// 从localStorage获取token
export const getToken = (): string | null => {
  return localStorage.getItem(TOKEN_KEY);
};

// 移除token
export const removeToken = (): void => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

// 检查token是否存在
export const hasToken = (): boolean => {
  return !!getToken();
};

// 解析JWT token获取payload（不验证签名）
export const parseToken = (token: string): any => {
  try {
    const base64Url = token.split('.')[1]; // 获取payload
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/'); // 解码
    // 解码
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    // 解析payload
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Token解析失败:', error);
    return null;
  }
};

// 检查token是否即将过期（提前5分钟）
export const isTokenExpiringSoon = (token?: string): boolean => {
  const currentToken = token || getToken();
  if (!currentToken) return true;

  const payload = parseToken(currentToken);
  if (!payload || !payload.exp) return true;

  const currentTime = Math.floor(Date.now() / 1000);
  const expirationTime = payload.exp;
  const fiveMinutes = 5 * 60; // 5分钟

  return (expirationTime - currentTime) <= fiveMinutes;
};

// 检查token是否已过期
export const isTokenExpired = (token?: string): boolean => {
  const currentToken = token || getToken();
  if (!currentToken) return true;

  const payload = parseToken(currentToken);
  if (!payload || !payload.exp) return true;

  const currentTime = Math.floor(Date.now() / 1000);
  return payload.exp < currentTime;
};

// 获取token的剩余有效时间（秒）
export const getTokenRemainingTime = (token?: string): number => {
  const currentToken = token || getToken();
  if (!currentToken) return 0;

  const payload = parseToken(currentToken);
  if (!payload || !payload.exp) return 0;

  const currentTime = Math.floor(Date.now() / 1000);
  const remainingTime = payload.exp - currentTime;
  return Math.max(0, remainingTime);
};

// 存储用户信息
export const setUserInfo = (user: any): void => {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

// 获取用户信息
export const getUserInfo = (): any => {
  const userStr = localStorage.getItem(USER_KEY);
  if (!userStr) return null;
  
  try {
    return JSON.parse(userStr);
  } catch (error) {
    console.error('用户信息解析失败:', error);
    return null;
  }
};

// 清除所有认证相关信息
export const clearAuth = (): void => {
  removeToken();
  // 可以在这里清除其他相关的缓存数据
};

// 检查用户是否已登录
export const isAuthenticated = (): boolean => {
  return hasToken() && !isTokenExpired();
};

// 格式化剩余时间为可读字符串
export const formatRemainingTime = (seconds: number): string => {
  if (seconds <= 0) return '已过期';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}小时${minutes}分钟`;
  } else if (minutes > 0) {
    return `${minutes}分钟${secs}秒`;
  } else {
    return `${secs}秒`;
  }
};
