import type { FriendInfo } from '../contracts/gen/ourchat/friend/v1/friend';

export type { Friend, FriendInfo } from '../contracts/gen/ourchat/friend/v1/friend';

export interface FriendList {
    // key: 好友ID  value: remark
    [key: number]: string | null;
}
// 好友信息列表类型
export interface FriendInfoList {
    // key: 好友ID
    [key: number]: FriendInfo;
}
