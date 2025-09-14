import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse, type AxiosError } from 'axios';
import { message } from 'antd'; //引入antd的message 消息提示组件
import type { ApiResponse } from '../globalType/apiResponse';

// Token刷新相关变量
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: any) => void;
  reject: (reason?: any) => void;
}> = [];

const http: AxiosInstance = axios.create({
  baseURL: 'http://127.0.0.1:3007', //请求地址
  timeout: 10000,  
  headers: {
    // 注：以下全局配置废除
    //大多数场景 axios 会自动处理 Content-Type
    // 如果写死了，所有负载都会JSON.stringify 转成字符串，导致其他格式无法传递（如formData
    // 全局统一JSON格式
    // 'Content-Type': 'application/json', //负载内容用 JSON.stringify 转成字符串，并用 application/json 作为请求头
    // 'Accept': 'application/json', //期望返回的数据格式是 JSON
    Accept: 'application/json',
  },
});


// Token刷新函数
const refreshToken = async (): Promise<string | null> => {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('没有token');
    }

    // 刷新token，返回新的token，第二个参数是请求配置
    const response = await axios.post('http://127.0.0.1:3007/api/refresh', {}, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.data.success) {
      const newToken = response.data.data.token;
      localStorage.setItem('token', newToken);
      return newToken;
    } else {
      throw new Error('token刷新失败');
    }
  } catch (error) {
    console.error('Token刷新失败:', error);
    localStorage.removeItem('token');
    window.location.href = '/login';
    return null;
  }
};

// 处理队列中的请求，用于排队等待刷新token
const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  
  failedQueue = [];
};

// 请求拦截器可以在请求发送前： 修改请求配置， 添加认证信息， 添加请求头，记录日志， 处理错误
http.interceptors.request.use(
  // 第一个参数：请求成功处理函数
  (config: any) => {
    // 添加认证 token，将 token 添加到请求头的 Authorization 字段，用于身份验证
    const token = localStorage.getItem('token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // 为 GET 请求添加时间戳参数，防止浏览器缓存导致的数据过期问题
    // 浏览器会缓存 GET 请求的响应，当再次请求相同 URL 时，可能直接返回缓存的数据
    if (config.method === 'get') {
      config.params = {
        ...config.params,
        _t: Date.now(),
      };
    }
    // 返回修改后的配置
    return config;
  },
  // 第二个参数：请求错误处理函数
  // 请求拦截器错误处理
  (error: AxiosError) => {
    // 请求错误处理
    console.error('请求拦截器错误:', error);
    message.error('请求配置错误');
    return Promise.reject(error);
  }
);

// 响应拦截器
// 注：只返回了data部分，没有返回success，组件中用try-catch或then处理逻辑
http.interceptors.response.use(
  // 第一个参数：响应成功处理函数
  (response: AxiosResponse) => {
    // 2xx的状态码都会触发该函数直接返回数据部分，简化调用
    return response.data;
  },
  // 第二个参数：响应错误处理函数
  async (error: AxiosError) => {
    // 超出 2xx的状态码都会触发该函数
    console.error('响应错误:', error);
    
    // 获取原始请求配置，用于重试请求
    const originalRequest = error.config as any;
    
    // 错误处理
    if (error.response) {
      // 服务器返回错误状态码
      const { status, data } = error.response;
      
      // 处理401错误（token过期或无效）
      if (status === 401 && !originalRequest._retry) {
        const errorData = data as any;
        
        // 检查是否是token过期
        if (errorData?.code === 'TOKEN_EXPIRED' || errorData?.message?.includes('过期')) {
          if (isRefreshing) {
            // 如果正在刷新token，将请求加入队列
            return new Promise((resolve, reject) => {
              failedQueue.push({ resolve, reject });
            }).then(token => {
              if (originalRequest.headers) {
                originalRequest.headers['Authorization'] = `Bearer ${token}`;
              }
              // 重试请求
              return http(originalRequest);
            }).catch(err => {
              return Promise.reject(err);
            });
          }

          // 设置重试标志，防止重复重试
          originalRequest._retry = true;
          isRefreshing = true;

          try {
            // 刷新token
            const newToken = await refreshToken();
            if (newToken) {
              processQueue(null, newToken);
              // 设置新的token
              if (originalRequest.headers) {
                originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
              }
              return http(originalRequest);
            }
          } catch (refreshError) {
            // 处理刷新token失败
            processQueue(refreshError, null);
            return Promise.reject(refreshError);
          } finally {
            isRefreshing = false;
          }
        } else {
          // 其他401错误，直接跳转登录
          message.error('未授权，请重新登录');
          localStorage.removeItem('token');
          window.location.href = '/login';
        }
      } else {
        // 处理其他HTTP错误
        switch (status) {
          case 400:
            message.error((data as any)?.message || '请求参数错误');
            break;
          case 403:
            message.error('拒绝访问');
            break;
          case 404:
            message.error('请求的资源不存在');
            break;
          case 409:
            message.error((data as any)?.message || '数据冲突');
            break;
          case 422:
            message.error((data as any)?.message || '数据验证失败');
            break;
          case 500:
            message.error('服务器内部错误');
            break;
          default:
            message.error((data as any)?.message || `请求失败 (${status})`);
        }
      }
    } else if (error.request) {
      // error.request 存在代表：请求配置正确，请求已经通过网络发送，但是服务器没有返回响应
      if (error.code === 'ECONNABORTED') {
        message.error('请求超时，请稍后重试');
      } else {
        message.error('网络错误，请检查网络连接');
      }
    } else {
      // 其他错误
      message.error('请求配置错误');
    }
    // 返回错误，用于在组件中处理错误
    return Promise.reject(error);
  }
);



// GET 请求
// 函数泛型语法 <T = any>，写在函数前面
// 注意：返回值是promise<response.data>
export const get = <T = any>(
  url: string, 
  config?: AxiosRequestConfig
): Promise<ApiResponse<T>> => {
  return http.get(url, config);
};

// POST 请求
export const post = <T = any>(
  url: string, 
  data?: any, 
  config?: AxiosRequestConfig
): Promise<ApiResponse<T>> => {
  return http.post(url, data, config);
};

// PUT 请求
export const put = <T = any>(
  url: string, 
  data?: any, 
  config?: AxiosRequestConfig
): Promise<ApiResponse<T>> => {
  return http.put(url, data, config);
};

// DELETE 请求
export const del = <T = any>(
  url: string, 
  config?: AxiosRequestConfig
): Promise<ApiResponse<T>> => {
  return http.delete(url, config);
};

// PATCH 请求
export const patch = <T = any>(
  url: string, 
  data?: any, 
  config?: AxiosRequestConfig
): Promise<ApiResponse<T>> => {
  return http.patch(url, data, config);
};

// 上传文件
export const upload = <T = any>(
  url: string, 
  file: File | FormData,
  onProgress?: (progress: number) => void
): Promise<ApiResponse<T>> => {
  const formData = file instanceof FormData ? file : new FormData();
  if (file instanceof File) {
    formData.append('file', file);
  }

  return http.post(url, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(progress);
      }
    },
  });
};

// 下载文件
export const download = (
  url: string, 
  filename?: string,
  config?: AxiosRequestConfig
): Promise<void> => {
  return http.get(url, {
    ...config,
    responseType: 'blob',
  }).then((response: any) => {
    const blob = new Blob([response]);
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename || 'download';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
  });
};

export default http;
