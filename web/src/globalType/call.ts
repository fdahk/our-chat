
// 用户信息
export interface CallUser {
  id: number;
  username: string;
  nickname: string;
  avatar: string;
}

// ICE 候选
export interface ICECandidate {
  candidate: string;
  sdpMLineIndex: number | null;
  sdpMid: string | null;
}

// Socket事件类型
export interface CallStartEvent {
  callId: string;
  from: CallUser;
  to: CallUser;
  offer: RTCSessionDescriptionInit;
}

// 通话被接受
export interface CallAcceptEvent {
  callId: string;
  from: number;
  to: number;
  answer: RTCSessionDescriptionInit;
}

// 通话被拒绝
export interface CallRejectEvent {
  callId: string;
}

// 通话结束
export interface CallEndEvent {
  callId: string;
}

// ICE候选
export interface CallIceEvent {
  callId: string;
  candidate: ICECandidate;
}