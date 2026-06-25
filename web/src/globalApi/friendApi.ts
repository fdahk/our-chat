import { get, put } from '@/utils/http'; 
import type { FriendInfo, FriendList } from '@/globalType/friend';
import type { FriendReq } from '@/store/friendStore';

interface FriendListResponse {
    friendId: FriendList;
    friendInfo: Record<number, FriendInfo>;
}

interface SearchUserResponse {
    exist: boolean;
    isFriend: boolean;
    friendInfo: FriendInfo & { id: number };
}

// 获取好友列表
export const getFriendList = (id: number) => {
    return get<FriendListResponse>(`/user/getFriendList/${id}`);
}
// 查询用户信息(按 用户名 / 手机号 / 用户ID;keyword 原样传字符串,后端做多字段匹配)
export const searchUser = ({keyword, userId}: {keyword: string | number, userId: number}) => {
    return get<SearchUserResponse>(`/user/searchUser`, { params: { keyword, userId } });
}
// 发起好友请求
export const addFriend = ({userId, friendId}: {userId: number, friendId: number}) => {
    return put<void, { userId: number; friendId: number }>(`/user/addFriend`, { userId, friendId });
}
//获取好友请求
export const getFriendReqs = (userId: number) => {
    return get<Record<number, FriendReq>>(`/user/getFriendReqs`, { params: { userId } });
}
//回复好友请求
export const replyFriendReq = ({userId, friendId, status}: {userId: number, friendId: number, status: string}) => {
    return put<void, { userId: number; friendId: number; status: string }>(`/user/replyFriendReq`, { userId, friendId, status });
}
// 更新好友备注(remark 为空串/全空白时清空备注)
export const updateRemark = ({userId, friendId, remark}: {userId: number, friendId: number, remark: string | null}) => {
    return put<void, { userId: number; friendId: number; remark: string | null }>(`/user/updateRemark`, { userId, friendId, remark });
}