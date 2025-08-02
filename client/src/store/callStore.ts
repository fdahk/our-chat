// client/src/store/callStore.ts - 完善版本

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { CallUser } from '../globalType/call';

export interface CallState {
  // 基础状态
  isActive: boolean;
  callId: string | null;
  
  // 用户信息
  localUser: CallUser | null;
  remoteUser: CallUser | null;
  
  // 通话状态
  status: 'idle' | 'calling' | 'ringing' | 'connected' | 'ended';
  
  // 媒体流
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  
  // 添加WebRTC协商数据
  pendingOffer: RTCSessionDescriptionInit | null;
  
  // 通话信息
  isMuted: boolean;
  startTime: number | null;
  duration: number;
  
  // 错误状态
  error: string | null;
}

const initialState: CallState = {
  isActive: false,
  callId: null,
  localUser: null,
  remoteUser: null,
  status: 'idle',
  localStream: null,
  remoteStream: null,
  pendingOffer: null, // 新增
  isMuted: false,
  startTime: null,
  duration: 0,
  error: null,
};

const callSlice = createSlice({
  name: 'call',
  initialState,
  reducers: {
    // 发起通话
    startCall: (state, action: PayloadAction<{
      callId: string;
      localUser: CallUser;
      remoteUser: CallUser;
    }>) => {
      const { callId, localUser, remoteUser } = action.payload;
      state.isActive = true;
      state.callId = callId;
      state.localUser = localUser;
      state.remoteUser = remoteUser;
      state.status = 'calling';
      state.error = null;
    },

    // 收到通话邀请 (包含offer)
    receiveCall: (state, action: PayloadAction<{
      callId: string;
      localUser: CallUser;
      remoteUser: CallUser;
      offer: RTCSessionDescriptionInit; // 新增offer
    }>) => {
      const { callId, localUser, remoteUser, offer } = action.payload;
      state.isActive = true;
      state.callId = callId;
      state.localUser = localUser;
      state.remoteUser = remoteUser;
      state.status = 'ringing';
      state.pendingOffer = offer; // 保存offer
      state.error = null;
    },

    // 连接建立
    connectCall: (state) => {
      state.status = 'connected';
      state.startTime = Date.now();
      state.pendingOffer = null; // 清除offer
    },

    // 结束通话
    endCall: (state) => {
      state.status = 'ended';
      state.duration = state.startTime ? Date.now() - state.startTime : 0;
    },

    // 重置状态
    resetCall: () => initialState,

    // 设置媒体流
    setLocalStream: (state, action: PayloadAction<MediaStream | null>) => {
      state.localStream = action.payload;
    },

    setRemoteStream: (state, action: PayloadAction<MediaStream | null>) => {
      state.remoteStream = action.payload;
    },

    // 切换静音
    toggleMute: (state) => {
      state.isMuted = !state.isMuted;
    },

    // 更新时长
    updateDuration: (state) => {
      if (state.startTime) {
        state.duration = Date.now() - state.startTime;
      }
    },

    // 设置错误
    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
      state.status = 'ended';
    },
  },
});

export const {
  startCall,
  receiveCall,
  connectCall,
  endCall,
  resetCall,
  setLocalStream,
  setRemoteStream,
  toggleMute,
  updateDuration,
  setError,
} = callSlice.actions;

export default callSlice.reducer;