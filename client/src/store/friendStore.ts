import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface FriendReq {
    id: number;
    user_id: number;
    friend_id: number;
    remark: string | null;
    status: string;
    created_at: string;
    updated_at: string;
}
interface FriendReqList {
    // key是好友id，value是好友请求
    [key: number]: FriendReq;
}

const initialState: FriendReqList = {};

const friendReqSlice = createSlice({
    name: 'friendReq',
    initialState,
    reducers: {
        initFriendReqList: (state, action: PayloadAction<FriendReqList>) => {
            return action.payload;
        },
        addFriendReq: (state, action: PayloadAction<FriendReq>) => {
            console.log('添加好友请求', action.payload);
            state[action.payload.friend_id] = action.payload;
        },
        setFriendReqStatus: (state, action: PayloadAction<{friend_id: number, status: string}>) => {
            state[action.payload.friend_id].status = action.payload.status;
        }
    },
});

export const { initFriendReqList, addFriendReq, setFriendReqStatus } = friendReqSlice.actions;
export default friendReqSlice.reducer;