// 好友数据类型
export interface Friend {
    friend_id: number;
    remark: string | null;
}
export interface FriendList {
    [key: number]: string | null;
}
// 好友信息类型
export interface FriendInfo {
    username: string;
    avatar: string;
    gender: string;
}
// 好友信息列表类型
export interface FriendInfoList {
    // key: 好友ID
    [key: number]: FriendInfo
}