import { get } from '@/utils/http'; 

// 获取好友列表
export const getFriendList = (id: number) => {
    return get(`/user/getFriendList/${id}`);
}