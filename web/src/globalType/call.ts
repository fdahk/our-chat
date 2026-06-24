// 通话类型:语音 / 视频。视频复用同一套信令与 WebRTC 协商,仅多请求/渲染视频轨道。
export type CallType = 'voice' | 'video';

export type {
  CallUser,
  SessionDescription,
  IceCandidate as ICECandidate,
  CallStart as CallStartEvent,
  CallAccept as CallAcceptEvent,
  CallReject as CallRejectEvent,
  CallEnd as CallEndEvent,
  CallIce as CallIceEvent,
} from '../contracts/gen/ourchat/call/v1/call';
