// 后端响应类型
// 接口泛型语法，写在变量名后面
export interface ApiResponse<T = any> {
    success: boolean; // 请求是否成功
    message: string; // 请求返回的消息
    data?: T; // 请求返回的数据类型与T类型一致
  }