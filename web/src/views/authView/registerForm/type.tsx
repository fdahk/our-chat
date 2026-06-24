// 注册表单数据类型
export interface RegisterFormModel {
    username: string;
    email: string;
    password: string;
    phone?: string | null; //需要配合数据库中的phone字段为null
    nickname?: string;
    avatar?: string;
    bio?: string;
}
  
// 注册响应数据类型
export interface RegisterResponseModel {
    id: number;
    username: string;
    email: string;
    phone?: string | null;
    nickname: string;
    avatar: string;
    bio: string;
    status: string;
    createdAt: string;
}
