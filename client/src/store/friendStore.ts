import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { User } from '@/globalType/user';

interface FriendReqList {
    [key: number]: User;
}

const initialState: FriendReqList = {};

const friendReqSlice = createSlice({
    name: 'friendReq',
    initialState,
    reducers: {
        initFriendReqList: (state, action: PayloadAction<FriendReqList>) => {
            state = action.payload;
        },
        addFriendReq: (state, action: PayloadAction<User>) => {
            state[action.payload.id] = action.payload;
        }
    },
});

export const { initFriendReqList, addFriendReq } = friendReqSlice.actions;
export default friendReqSlice.reducer;