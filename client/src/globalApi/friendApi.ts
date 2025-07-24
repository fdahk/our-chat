import { get, put } from '@/utils/http'; 

// 获取好友列表
export const getFriendList = (id: number) => {
    return get(`/user/getFriendList/${id}`);
}
// 查询用户信息
export const searchUser = ({keyword, userId}: {keyword: number, userId: number}) => {
    return get(`/user/searchUser`, { params: { keyword, userId } });
}
// 发起好友请求
export const addFriend = ({userId, friend_id}: {userId: number, friend_id: number}) => {
    return put(`/user/addFriend`, { userId, friend_id });
}
//获取好友请求
export const getFriendReqs = (userId: number) => {
    return get(`/user/getFriendReqs`, { params: { userId } });
}
//回复好友请求 
export const replyFriendReq = ({userId, friend_id, status}: {userId: number, friend_id: number, status: string}) => {
    return put(`/user/replyFriendReq`, { userId, friend_id, status });
}