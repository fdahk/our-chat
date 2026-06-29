import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { FriendRequest } from '../contracts/openapi';

// username/avatar:请求方多半还不是好友,本地 friendInfo 取不到,卡片渲染要回退到这里
export type FriendReq = FriendRequest;
interface FriendReqList {
    // key是好友id，value是好友请求
    [key: number]: FriendReq;
}

const initialState: FriendReqList = {};

const friendReqSlice = createSlice({
    name: 'friendReq',
    initialState,
    reducers: {
        initFriendReqList: (_, action: PayloadAction<FriendReqList>) => {
            return action.payload;
        },
        addFriendReq: (state, action: PayloadAction<FriendReq>) => {
            console.log('添加好友请求', action.payload);
            state[action.payload.friendId] = action.payload;
        },
        setFriendReqStatus: (state, action: PayloadAction<{friendId: number, status: string}>) => {
            state[action.payload.friendId].status = action.payload.status;
        }
    },
});

export const { initFriendReqList, addFriendReq, setFriendReqStatus } = friendReqSlice.actions;
export default friendReqSlice.reducer;