// 用户类型。单一契约源:proto/ourchat/user/v1/user.proto(字段统一驼峰)。
// 注:本项目 wire 约定 int64 id 序列化为 number(server bigint-json polyfill)。
export interface User {
    id: number;
    username: string;
    email: string;
    phone: string;
    nickname: string;
    avatar: string;
    bio: string;
    status: string;
    lastSeen: string;
    createdAt: string;
    updatedAt: string;
}
