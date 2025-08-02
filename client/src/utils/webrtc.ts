import { type ICECandidate } from '../globalType/call';

// WebRTC配置 - 使用多个STUN服务器确保连接稳定性
const rtcConfiguration: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 10, // 预生成ICE候选池
};

/**
 * WebRTC管理器
 * 遵循标准WebRTC协商流程，提供清晰的状态管理
 */
export class WebRTCManager {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private pendingIceCandidates: ICECandidate[] = []; // 暂存ICE候选
  
  // 状态追踪
  private isInitialized = false;
  private isNegotiating = false;
  
  // 事件回调
  public onRemoteStream?: (stream: MediaStream) => void;
  public onICECandidate?: (candidate: ICECandidate) => void;
  public onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  public onError?: (error: Error) => void;

  constructor() {
    this.initialize();
  }

  /**
   * 初始化WebRTC连接
   */
  private initialize() {
    try {
      console.log('初始化WebRTC连接');
      this.peerConnection = new RTCPeerConnection(rtcConfiguration);
      this.setupEventHandlers();
      this.isInitialized = true;
    } catch (error) {
      console.error('WebRTC初始化失败:', error);
      this.handleError(new Error('WebRTC初始化失败'));
    }
  }

  /**
   * 设置事件监听器
   */
  private setupEventHandlers() {
    if (!this.peerConnection) return;

    // ICE候选事件
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('生成ICE候选');
        const candidate: ICECandidate = {
          candidate: event.candidate.candidate,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          sdpMid: event.candidate.sdpMid,
        };
        this.onICECandidate?.(candidate);
      }
    };

    // 远程流事件
    this.peerConnection.ontrack = (event) => {
      console.log('收到远程流');
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
        this.onRemoteStream?.(this.remoteStream);
      }
    };

    // 连接状态变化
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      console.log('连接状态变化:', state);
      if (state) {
        this.onConnectionStateChange?.(state);
        
        // 连接失败时重置
        if (state === 'failed' || state === 'disconnected') {
          setTimeout(() => this.cleanup(), 1000);
        }
      }
    };

    // ICE连接状态变化
    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection?.iceConnectionState;
      console.log('ICE连接状态:', state);
    };

    // 协商需要事件
    this.peerConnection.onnegotiationneeded = () => {
      console.log('需要重新协商');
    };
  }

  /**
   * 获取用户音频流
   */
  async getUserMedia(): Promise<MediaStream> {
    try {
      console.log('请求麦克风权限');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100,
        },
        video: false,
      });
      
      console.log('获取音频流成功');
      this.localStream = stream;
      return stream;
    } catch (error) {
      console.error('获取音频流失败:', error);
      throw new Error('无法获取麦克风权限，请检查浏览器设置');
    }
  }

  /**
   * 创建offer - 修复版本
   */
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.isInitialized || !this.peerConnection) {
      throw new Error('WebRTC未初始化');
    }

    try {
      console.log('创建Offer开始');
      console.log('初始信令状态:', this.peerConnection.signalingState);
      
      // 确保是stable状态
      if (this.peerConnection.signalingState !== 'stable') {
        console.warn('PeerConnection状态不稳定，重置中...');
        this.reset();
        await new Promise(resolve => setTimeout(resolve, 200));
        
        if (!this.peerConnection) {
          throw new Error('重置后PeerConnection无效');
        }
      }
      
      // 添加本地流 - 在创建offer前添加
      if (this.localStream) {
        console.log('添加本地音频流到PeerConnection');
        
        // 检查是否已经添加过轨道
        const existingSenders = this.peerConnection.getSenders();
        console.log('现有发送者数量:', existingSenders.length);
        
        this.localStream.getTracks().forEach(track => {
          const existingSender = existingSenders.find(sender => sender.track === track);
          if (!existingSender && this.peerConnection) {
            this.peerConnection.addTrack(track, this.localStream!);
            console.log('音频轨道已添加');
          } else {
            console.log('音频轨道已存在，跳过添加');
          }
        });
      } else {
        console.warn('没有本地流可添加');
      }

      // 设置协商标志
      this.isNegotiating = true;
      
      // 创建offer
      console.log('开始创建Offer...');
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });
      
      console.log('Offer创建完成，设置本地描述...');
      
      // 设置本地描述
      await this.peerConnection.setLocalDescription(offer);
      
      const finalState = this.peerConnection.signalingState;
      console.log('Offer创建成功');
      console.log('最终信令状态:', finalState);
      console.log('Offer SDP长度:', offer.sdp?.length);
      
      // 验证状态
      if (finalState !== 'have-local-offer') {
        throw new Error(`创建Offer后状态异常: ${finalState}`);
      }
      
      return offer;
    } catch (error) {
      console.error('创建Offer失败:', error);
      this.isNegotiating = false;
      throw new Error('创建通话请求失败: ' + (error as Error).message);
    }
  }

  /**
   * 处理收到的offer并创建answer
   */
  async handleOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.isInitialized || !this.peerConnection) {
      throw new Error('WebRTC未初始化');
    }

    try {
      console.log('处理Offer并创建Answer');
      
      // 设置远程描述
      await this.peerConnection.setRemoteDescription(offer);
      
      // 添加本地流
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
          this.peerConnection!.addTrack(track, this.localStream!);
        });
        console.log('本地流已添加');
      }
      
      // 创建answer
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      
      // 处理暂存的ICE候选
      await this.processPendingIceCandidates();
      
      console.log('Answer创建成功');
      return answer;
    } catch (error) {
      console.error('处理Offer失败:', error);
      throw new Error('处理通话请求失败');
    }
  }

  /**
   * 处理收到的answer - 增强版本
   */
  async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.isInitialized || !this.peerConnection) {
      throw new Error('WebRTC未初始化');
    }

    try {
      console.log('处理Answer开始');
      console.log('当前信令状态:', this.peerConnection.signalingState);
      console.log('Answer类型:', answer.type);
      
      // 检查状态，避免重复处理
      if (this.peerConnection.signalingState !== 'have-local-offer') {
        console.warn('PeerConnection状态不正确，当前状态:', this.peerConnection.signalingState);
        console.warn('期望状态: have-local-offer，跳过Answer处理');
        return;
      }

      // 检查answer有效性
      if (!answer || answer.type !== 'answer') {
        throw new Error('无效的Answer');
      }

      await this.peerConnection.setRemoteDescription(answer);
      console.log('Answer设置成功，当前状态:', this.peerConnection.signalingState);
      
      // 处理暂存的ICE候选
      await this.processPendingIceCandidates();
      
      this.isNegotiating = false;
      console.log('Answer处理完成');
    } catch (error) {
      console.error('处理Answer失败:', error);
      this.isNegotiating = false;
      throw new Error('建立连接失败: ' + (error as Error).message);
    }
  }

  /**
   * 添加ICE候选
   */
  async addIceCandidate(candidate: ICECandidate): Promise<void> {
    if (!this.peerConnection) {
      console.warn('PeerConnection未初始化，暂存ICE候选');
      this.pendingIceCandidates.push(candidate);
      return;
    }

    // 如果远程描述还未设置，暂存候选
    if (!this.peerConnection.remoteDescription) {
      console.log('远程描述未设置，暂存ICE候选');
      this.pendingIceCandidates.push(candidate);
      return;
    }

    try {
      const rtcCandidate = new RTCIceCandidate({
        candidate: candidate.candidate,
        sdpMLineIndex: candidate.sdpMLineIndex,
        sdpMid: candidate.sdpMid,
      });
      
      await this.peerConnection.addIceCandidate(rtcCandidate);
      console.log('ICE候选添加成功');
    } catch (error) {
      console.warn('添加ICE候选失败:', error);
    }
  }

  /**
   * 处理暂存的ICE候选
   */
  private async processPendingIceCandidates(): Promise<void> {
    if (this.pendingIceCandidates.length === 0) return;
    
    console.log(`处理${this.pendingIceCandidates.length}个暂存的ICE候选`);
    
    for (const candidate of this.pendingIceCandidates) {
      await this.addIceCandidate(candidate);
    }
    
    this.pendingIceCandidates = [];
  }

  /**
   * 切换静音状态
   */
  toggleMute(): boolean {
    if (!this.localStream) return false;
    
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      console.log('静音状态:', !audioTrack.enabled);
      return !audioTrack.enabled;
    }
    return false;
  }

  /**
   * 获取连接统计信息
   */
  async getStats(): Promise<RTCStatsReport | null> {
    if (!this.peerConnection) return null;
    return await this.peerConnection.getStats();
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    console.log('清理WebRTC资源');
    
    // 停止本地流
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
        console.log('停止音频轨道');
      });
      this.localStream = null;
    }

    // 关闭连接
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    // 重置状态
    this.remoteStream = null;
    this.pendingIceCandidates = [];
    this.isInitialized = false;
    this.isNegotiating = false;
  }

  /**
   * 重置连接
   */
  reset(): void {
    this.cleanup();
    this.initialize();
  }

  /**
   * 错误处理
   */
  private handleError(error: Error): void {
    console.error('WebRTC错误:', error);
    this.onError?.(error);
  }

  // Getters
  get isConnected(): boolean {
    return this.peerConnection?.connectionState === 'connected';
  }

  get connectionState(): RTCPeerConnectionState | null {
    return this.peerConnection?.connectionState || null;
  }

  get localMediaStream(): MediaStream | null {
    return this.localStream;
  }

  get remoteMediaStream(): MediaStream | null {
    return this.remoteStream;
  }

  /**
   * 获取详细状态信息
   */
  getDetailedState() {
    if (!this.peerConnection) return null;
    
    return {
      signalingState: this.peerConnection.signalingState,
      iceConnectionState: this.peerConnection.iceConnectionState,
      connectionState: this.peerConnection.connectionState,
      iceGatheringState: this.peerConnection.iceGatheringState,
      isNegotiating: this.isNegotiating,
      hasLocalStream: !!this.localStream,
      hasRemoteStream: !!this.remoteStream,
    };
  }
}