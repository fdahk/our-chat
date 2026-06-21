import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosError,
  type InternalAxiosRequestConfig,
} from 'axios';
import i18n from '@/i18n';
import { toast } from '@/globalComponents/toast/bridge';
import type { ApiResponse } from '../globalType/apiResponse';
import { API_BASE_URL } from './runtime';

// 拦截器非 React 上下文,t() 直接走 i18n 单例
const t = (key: string, opts?: Record<string, unknown>): string =>
  i18n.t(key, opts) as string;

interface ErrorResponseData {
  message?: string;
  code?: string;
}

type RetryableAxiosRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
};

const CSRF_COOKIE = 'csrfToken';
const SAFE_METHODS = new Set(['get', 'head', 'options']);

// 读取可读的 csrfToken cookie（token 本身是 HttpOnly，JS 读不到）
const readCookie = (name: string): string | null => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp('(?:^|; )' + escaped + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
};

// Token刷新相关变量
let isRefreshing = false;
let failedQueue: Array<{
  resolve: () => void;
  reject: (reason?: unknown) => void;
}> = [];

const http: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  // 跨域时携带 cookie；同源（dev 经 Vite 代理）也无妨
  withCredentials: true,
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


// Token刷新函数：基于 HttpOnly cookie 重签，新 token 由后端重新写回 cookie。
// 用裸 axios 调用避免触发本实例拦截器递归；手动带上 withCredentials 与 CSRF 头。
const refreshToken = async (): Promise<boolean> => {
  try {
    await axios.post(`${API_BASE_URL}/api/refresh`, {}, {
      withCredentials: true,
      headers: { 'X-CSRF-Token': readCookie(CSRF_COOKIE) ?? '' },
    });
    return true;
  } catch (error) {
    console.error('Token刷新失败:', error);
    window.location.href = '/auth';
    return false;
  }
};

// 处理队列中的请求，用于排队等待刷新token
const processQueue = (error?: unknown) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve();
    }
  });

  failedQueue = [];
};

const getErrorMessage = (data: unknown, fallback: string) => {
  if (typeof data === 'object' && data !== null && 'message' in data) {
    const candidate = (data as ErrorResponseData).message;
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate;
    }
  }

  return fallback;
};

// 请求拦截器可以在请求发送前： 修改请求配置， 添加认证信息， 添加请求头，记录日志， 处理错误
http.interceptors.request.use(
  // 第一个参数：请求成功处理函数
  (config: InternalAxiosRequestConfig) => {
    // 鉴权 token 由浏览器随 HttpOnly cookie 自动携带，前端不再手动塞 Authorization。
    // 变更类请求补上双提交 CSRF 头：把可读的 csrfToken cookie 回填到 X-CSRF-Token。
    const method = (config.method ?? 'get').toLowerCase();
    if (!SAFE_METHODS.has(method) && config.headers) {
      const csrf = readCookie(CSRF_COOKIE);
      if (csrf) config.headers['X-CSRF-Token'] = csrf;
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
    toast.err(t('http.requestConfigError'));
    return Promise.reject(error);
  }
);

// 响应拦截器
// 注：只返回了data部分，没有返回success，组件中用try-catch或then处理逻辑
http.interceptors.response.use(
  // 第一个参数：响应成功处理函数
  (response) => {
    // 2xx的状态码都会触发该函数直接返回数据部分，简化调用
    return response.data;
  },
  // 第二个参数：响应错误处理函数
  async (error: AxiosError) => {
    // 超出 2xx的状态码都会触发该函数
    console.error('响应错误:', error);
    
    // 获取原始请求配置，用于重试请求
    const originalRequest = error.config as RetryableAxiosRequestConfig | undefined;
    
    // 错误处理
    if (error.response) {
      // 服务器返回错误状态码
      const { status, data } = error.response;
      
      // 处理401错误（token过期或无效）
      if (status === 401 && originalRequest && !originalRequest._retry) {
        const errorData = typeof data === 'object' && data !== null ? (data as ErrorResponseData) : undefined;
        
        // 检查是否是token过期
        if (errorData?.code === 'TOKEN_EXPIRED' || errorData?.message?.includes('过期')) {
          if (isRefreshing) {
            // 如果正在刷新token，将请求加入队列，刷新完成后重试（cookie 已更新，无需改请求头）
            return new Promise<void>((resolve, reject) => {
              failedQueue.push({ resolve, reject });
            }).then(() => http(originalRequest));
          }

          // 设置重试标志，防止重复重试
          originalRequest._retry = true;
          isRefreshing = true;

          try {
            // 刷新token（新 token 写回 cookie）
            const ok = await refreshToken();
            if (ok) {
              processQueue();
              return http(originalRequest);
            }
            return Promise.reject(error);
          } catch (refreshError) {
            // 处理刷新token失败
            processQueue(refreshError);
            return Promise.reject(refreshError);
          } finally {
            isRefreshing = false;
          }
        } else {
          // 其他401错误，直接跳转登录
          toast.err(t('http.unauthorized'));
          window.location.href = '/auth';
        }
      } else {
        // 处理其他HTTP错误
        switch (status) {
          case 400:
            toast.err(getErrorMessage(data, t('http.badRequest')));
            break;
          case 403:
            toast.err(t('http.forbidden'));
            break;
          case 404:
            toast.err(t('http.notFound'));
            break;
          case 409:
            toast.err(getErrorMessage(data, t('http.conflict')));
            break;
          case 422:
            toast.err(getErrorMessage(data, t('http.unprocessable')));
            break;
          case 500:
            toast.err(t('http.serverError'));
            break;
          default:
            toast.err(getErrorMessage(data, t('http.requestFailed', { status })));
        }
      }
    } else if (error.request) {
      // error.request 存在代表：请求配置正确，请求已经通过网络发送，但是服务器没有返回响应
      if (error.code === 'ECONNABORTED') {
        toast.err(t('http.timeout'));
      } else {
        toast.err(t('http.networkError'));
      }
    } else {
      // 其他错误
      toast.err(t('http.requestConfigError'));
    }
    // 返回错误，用于在组件中处理错误
    return Promise.reject(error);
  }
);



// GET 请求
// 函数泛型语法 <T = unknown>，写在函数前面
// 注意：返回值是promise<response.data>
export const get = <T = unknown>(
  url: string, 
  config?: AxiosRequestConfig
): Promise<ApiResponse<T>> => {
  return http.get(url, config);
};

// POST 请求
export const post = <T = unknown, D = unknown>(
  url: string, 
  data?: D, 
  config?: AxiosRequestConfig
): Promise<ApiResponse<T>> => {
  return http.post(url, data, config);
};

// PUT 请求
export const put = <T = unknown, D = unknown>(
  url: string, 
  data?: D, 
  config?: AxiosRequestConfig
): Promise<ApiResponse<T>> => {
  return http.put(url, data, config);
};

// DELETE 请求
export const del = <T = unknown>(
  url: string, 
  config?: AxiosRequestConfig
): Promise<ApiResponse<T>> => {
  return http.delete(url, config);
};

// PATCH 请求
export const patch = <T = unknown, D = unknown>(
  url: string, 
  data?: D, 
  config?: AxiosRequestConfig
): Promise<ApiResponse<T>> => {
  return http.patch(url, data, config);
};

// 上传文件
export const upload = <T = unknown>(
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
// 走 http 实例:复用 baseURL 与请求拦截器(鉴权 cookie 由浏览器自动携带),
// 受保护资源才下得动;同时享受 401 自动刷新 token 的逻辑。
// 注:响应拦截器已把 AxiosResponse 解包为 response.data,blob 模式下即 Blob 本体。
export const download = async (
  url: string,
  filename?: string,
  config?: AxiosRequestConfig
): Promise<void> => {
  const blob = (await http.get(url, {
    ...config,
    responseType: 'blob',
  })) as unknown as Blob;

  // 浏览器没有"把内存里的二进制存成文件"的直接 API,标准做法是模拟一次<a download>点击:
  // 1. 把 Blob 包成一个临时的 blob: 协议 URL(仅本页可访问,指向内存里的这份数据)
  const downloadUrl = window.URL.createObjectURL(blob);
  // 2. 造一个隐藏的 <a>,href 指向该 URL,download 属性告诉浏览器"点击是下载而非导航",并指定文件名
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = filename || 'download';
  // 3. 必须先挂到文档里,部分浏览器(如旧版 Firefox)对未入 DOM 的元素 .click() 不生效
  document.body.appendChild(link);
  // 4. 用代码触发点击,弹出浏览器的保存对话框/直接落盘
  link.click();
  // 5. 善后:移除临时节点
  document.body.removeChild(link);
  // 6. 释放 blob URL 占用的内存(createObjectURL 创建的引用不会自动回收,不 revoke 会内存泄漏)
  window.URL.revokeObjectURL(downloadUrl);
};

export default http;
