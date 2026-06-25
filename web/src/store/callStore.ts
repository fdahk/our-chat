// client/src/store/callStore.ts - 完善版本

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { CallUser, CallType } from '../globalType/call';

export interface CallState {
  isActive: boolean;
  callId: string | null;

  // 用户信息
  localUser: CallUser | null;
  remoteUser: CallUser | null;

  // 语音 / 视频。决定 getUserMedia 是否取视频轨,以及弹窗是否渲染视频画面。
  callType: CallType;

  // 通话状态。reconnecting:对端掉线 / 本端刷新恢复期间的过渡态(弹窗不消失)。
  status: 'idle' | 'calling' | 'ringing' | 'connected' | 'reconnecting' | 'ended';
  
  // 媒体流
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  
  // 添加WebRTC协商数据
  pendingOffer: RTCSessionDescriptionInit | null;
  
  // 通话时的相关信息
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
  callType: 'voice',
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
      callType: CallType;
    }>) => {
      const { callId, localUser, remoteUser, callType } = action.payload;
      state.isActive = true;
      state.callId = callId;
      state.localUser = localUser;
      state.remoteUser = remoteUser;
      state.callType = callType;
      state.status = 'calling';
      state.error = null;
    },

    // 收到通话邀请 (包含offer)
    receiveCall: (state, action: PayloadAction<{
      callId: string;
      localUser: CallUser;
      remoteUser: CallUser;
      offer: RTCSessionDescriptionInit; // 新增offer
      callType: CallType;
    }>) => {
      const { callId, localUser, remoteUser, offer, callType } = action.payload;
      state.isActive = true;
      state.callId = callId;
      state.localUser = localUser;
      state.remoteUser = remoteUser;
      state.callType = callType;
      state.status = 'ringing';
      state.pendingOffer = offer; // 保存offer
      state.error = null;
    },

    // 连接建立。startTime 仅首次设置:重连(reconnecting→connected)时保留原值,通话时长不清零。
    connectCall: (state) => {
      state.status = 'connected';
      if (!state.startTime) state.startTime = Date.now();
      state.pendingOffer = null; // 清除offer
    },

    // 进入重连中(对端掉线 / 本端刷新恢复期间)。保持 isActive,弹窗不消失。
    reconnectingCall: (state) => {
      state.status = 'reconnecting';
    },

    // 刷新重载后从持久化恢复通话上下文(挂载时调用)。startTime 沿用持久化值续算时长。
    // status:邀请恢复为 ringing(被叫等接听)/ calling(主叫呼叫中);通话恢复为 reconnecting。
    // pendingOffer 一律置 null:刷新前的 offer 与已发出的 ICE 候选都已失效,恢复时一律重新协商。
    restoreCall: (state, action: PayloadAction<{
      callId: string;
      localUser: CallUser;
      remoteUser: CallUser;
      callType: CallType;
      status: 'calling' | 'ringing' | 'reconnecting';
      startTime: number | null;
      isMuted: boolean;
    }>) => {
      const { callId, localUser, remoteUser, callType, status, startTime, isMuted } = action.payload;
      state.isActive = true;
      state.callId = callId;
      state.localUser = localUser;
      state.remoteUser = remoteUser;
      state.callType = callType;
      state.status = status;
      state.startTime = startTime;
      state.isMuted = isMuted;
      state.pendingOffer = null;
      state.error = null;
    },

    // 更新待接听的 offer(主叫刷新后重发新 offer,被叫仍在振铃时替换,使接听用新 offer)。
    updatePendingOffer: (state, action: PayloadAction<RTCSessionDescriptionInit>) => {
      state.pendingOffer = action.payload;
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
  startCall, // 发起通话
  receiveCall, // 收到通话邀请
  connectCall, // 连接建立
  reconnectingCall, // 进入重连中
  restoreCall, // 刷新重载后恢复通话上下文
  updatePendingOffer, // 替换待接听 offer
  endCall, // 结束通话
  resetCall, // 重置状态
  setLocalStream, // 设置本地媒体流
  setRemoteStream, // 设置远程媒体流
  toggleMute, // 切换静音
  updateDuration, // 更新时长
  setError, // 设置错误
} = callSlice.actions;

export default callSlice.reducer;