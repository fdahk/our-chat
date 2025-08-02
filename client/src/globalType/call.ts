// client/src/globalType/call.ts - 简化的类型定义

export interface CallUser {
  id: number;
  username: string;
  nickname: string;
  avatar: string;
}

export interface ICECandidate {
  candidate: string;
  sdpMLineIndex: number | null;
  sdpMid: string | null;
}

// 简化的Socket事件类型
export interface CallStartEvent {
  callId: string;
  from: CallUser;
  to: CallUser;
  offer: RTCSessionDescriptionInit;
}

export interface CallAcceptEvent {
  callId: string;
  from: number;
  to: number;
  answer: RTCSessionDescriptionInit;
}

export interface CallRejectEvent {
  callId: string;
}

export interface CallEndEvent {
  callId: string;
}

export interface CallIceEvent {
  callId: string;
  candidate: ICECandidate;
}

// 移除不需要的复杂类型
// CallState, CallSignal, CallInvitation, CallHistory 等都已简化到 store 中