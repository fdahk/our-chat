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
// 查询用户信息
export const searchUser = ({keyword, userId}: {keyword: number, userId: number}) => {
    return get<SearchUserResponse>(`/user/searchUser`, { params: { keyword, userId } });
}
// 发起好友请求
export const addFriend = ({userId, friend_id}: {userId: number, friend_id: number}) => {
    return put<void, { userId: number; friend_id: number }>(`/user/addFriend`, { userId, friend_id });
}
//获取好友请求
export const getFriendReqs = (userId: number) => {
    return get<Record<number, FriendReq>>(`/user/getFriendReqs`, { params: { userId } });
}
//回复好友请求 
export const replyFriendReq = ({userId, friend_id, status}: {userId: number, friend_id: number, status: string}) => {
    return put<void, { userId: number; friend_id: number; status: string }>(`/user/replyFriendReq`, { userId, friend_id, status });
}