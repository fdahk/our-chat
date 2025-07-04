import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse, type AxiosError } from 'axios';
import { message } from 'antd';

const http: AxiosInstance = axios.create({
  baseURL: 'http://127.0.0.1:3007', 
  timeout: 10000,  
  headers: {
    // 统一JSON格式
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// 请求拦截器
http.interceptors.request.use(
  (config: any) => {
    // 添加认证 token
    const token = localStorage.getItem('token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // 添加时间戳防止缓存
    if (config.method === 'get') {
      config.params = {
        ...config.params,
        _t: Date.now(),
      };
    }
    return config;
  },

  (error: AxiosError) => {
    // 请求错误处理
    console.error('请求拦截器错误:', error);
    message.error('请求配置错误');
    return Promise.reject(error);
  }
);

// 响应拦截器
http.interceptors.response.use(
  (response: AxiosResponse) => {
    // 2xx的状态码都会触发该函数直接返回数据部分，简化调用
    return response.data;
  },
  (error: AxiosError) => {
    // 超出 2xx的状态码都会触发该函数
    console.error('响应错误:', error);
    // 错误处理
    if (error.response) {
      // 服务器返回错误状态码
      const { status, data } = error.response;
      
      switch (status) {
        case 400:
          message.error((data as any)?.message || '请求参数错误');
          break;
        case 401:
          message.error('未授权，请重新登录');
          // 清除 token 并跳转登录页
          localStorage.removeItem('token');
          window.location.href = '/login';
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
    } else if (error.request) {
      // 请求已发出但没有收到响应
      if (error.code === 'ECONNABORTED') {
        message.error('请求超时，请稍后重试');
      } else {
        message.error('网络错误，请检查网络连接');
      }
    } else {
      // 其他错误
      message.error('请求配置错误');
    }

    return Promise.reject(error);
  }
);

// 通用请求方法封装
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
}

// GET 请求
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
