import { type ICECandidate } from '../globalType/call';

/**
 * WebRTC 配置对象：ICE服务器配置和连接参数
 * 
 * @property {Array} iceServers - ICE服务器列表，用于NAT穿透
 *   -ICE服务器：用于帮助 WebRTC 完成 NAT穿透 的外部服务器
 *      包括 STUN 和 TURN 两种类型
 *      STUN服务器：获取设备的公网IP和端口（用于直接P2P连接）
 *      TURN服务器：在无法直接P2P时作为数据中继（保底方案，但带宽成本高）
 *   -公共STUN服务器（如Google）适合测试，生产环境建议自建或使用商业服务（如Twilio、腾讯云TRTC）
 *   - 使用Google的公共STUN服务器作为默认配置
 *   - 生产环境建议添加TURN服务器以应对严格的NAT环境
 *     NAT穿透：让位于不同内网（如家庭WiFi和公司网络）的设备直接通信的技术。WebRTC 使用 ICE框架 实现穿透
 *     穿透流程：
        收集候选路径：
        主机候选（本地IP）
        反射候选（通过STUN服务器获取的公网IP）
        中继候选（通过TURN服务器转发）
        优先级排序：按网络延迟和类型排序（直接连接 > 反射 > 中继）。
        连通性检查：双方尝试所有候选路径，选择最优路径。
        失败场景
        对称型NAT（Symmetric NAT）可能无法穿透，必须依赖TURN服务器。
      
      STUN服务器（Session Traversal Utilities for NAT）
        STUN 是一种轻量级协议，用于帮助设备发现自己的公网IP和端口。
        工作原理
        设备向STUN服务器发送请求：“我的公网地址是什么？”
        STUN服务器回复：“你的公网地址是 A.B.C.D:Port ”。
        WebRTC 将此地址作为候选路径之一。
        限制：
        不能穿透所有NAT：对称型NAT下STUN可能失效。
        无数据转发：仅提供地址发现，不参与实际数据传输。
      TURN服务器（Traversal Using Relays around NAT）
        TURN 是STUN的扩展，当P2P连接失败时，通过TURN服务器中转数据。
        代码中未配置，但生产环境建议添加：
        高可靠性：确保任何网络环境下都能连接。
        高成本：所有流量经过服务器，消耗带宽资源。
 * @property {number} iceCandidatePoolSize - 预生成的ICE候选数量
 *   - 较大的值会增加连接成功率但会消耗更多资源
 */
const rtcConfiguration: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 10, // 预生成ICE候选池
};

/**
 * WebRTC 管理器类
 * 封装完整的WebRTC连接生命周期管理，包括：
 * - 媒体流获取
 * - 信令交换(SDP/ICE)
 * - 连接状态管理
 * - 错误处理和资源清理
 * 
 * 1. 创建实例时会自动初始化连接
 * 2. 通过事件回调获取连接状态和媒体流
 * 3. 调用createOffer/handleOffer等方法进行信令交换
 */
export class WebRTCManager {
  // PeerConnection实例，WebRTC核心对象
  // 用于建立端到端（P2P）的多媒体通信连接。负责：
  // 媒体流（音频/视频）传输
  // 网络穿透（NAT/防火墙）
  // 信令协商（SDP/ICE）
  // 加密与带宽管理
  private peerConnection: RTCPeerConnection | null = null;
  
  // 本地媒体流(麦克风/摄像头)
  private localStream: MediaStream | null = null;
  
  // 远程媒体流(对方音视频)
  private remoteStream: MediaStream | null = null;
  
  // 暂存的ICE候选(用于在SDP交换完成前缓存候选)
  private pendingIceCandidates: ICECandidate[] = [];
  
  // 状态标志
  private isInitialized = false; // 是否已初始化
  private isNegotiating = false;  // 是否正在协商中
  
  // 收到远程媒体流时触发
  public onRemoteStream?: (stream: MediaStream) => void;
  
  // 生成ICE候选时触发(需要将候选发送给对端)
  public onICECandidate?: (candidate: ICECandidate) => void;
  
  // 连接状态变化时触发
  public onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  
  // 发生错误时触发
  public onError?: (error: Error) => void;

  constructor() {
    this.initialize();
  }

  //初始化webRTC
  /**
   * 初始化WebRTC连接
   * 创建RTCPeerConnection实例并设置事件监听器
   * 这是WebRTC连接的第一步，必须在其他操作前调用
   * @throws 初始化失败会触发onError回调
   */
  private initialize() {
    try {
      console.log('初始化WebRTC连接');
      
      // 创建PeerConnection实例，传入配置
      this.peerConnection = new RTCPeerConnection(rtcConfiguration);
      
      // 设置所有必要的事件监听器
      this.setupEventHandlers();
      
      // 标记初始化完成
      this.isInitialized = true;
    } catch (error) {
      console.error('WebRTC初始化失败:', error);
      this.handleError(new Error('WebRTC初始化失败'));
    }
  }

  // 创建offer/sdp offer
  /**
   * 设置PeerConnection事件监听器
   * 
   * WebRTC通过事件驱动模型工作，这里设置了:
   * 1. ICE候选生成事件
   * 2. 远程媒体流到达事件
   * 3. 连接状态变化事件
   * 4. ICE连接状态事件
   * 5. 重新协商事件
   * 
   * 注意：这些事件处理函数会在整个连接生命周期中被多次调用
   */
  private setupEventHandlers() {
    if (!this.peerConnection) return;

    /**
     * ICE候选生成事件
     * 当发现新的ICE候选(网络路径)时触发
     * 当 event.candidate 为 null 时，表示候选收集完成
     * 需要将候选通过信令服务器发送给对端
     * 信令（Signaling）详解
        信令是 WebRTC 中用于协调通信双方建立连接的控制协议，本身不属于 WebRTC 技术栈，但却是实现 P2P 通信的关键桥梁。以下是核心要点：
        信令的作用
        交换元数据：协商媒体格式（SDP）、网络地址（ICE候选）等。
        协调状态：管理呼叫建立、修改、终止等生命周期。
        穿透辅助：帮助设备绕过 NAT/防火墙（需配合 STUN/TURN）。
        类比：
        类似打电话时的“拨号-振铃-接听”流程，信令就是双方协商“用什么语言通话、如何找到对方”的过程。
        WebRTC 不限定信令协议，常用方案包括：
          WebSocket（推荐）：实时双向通信。
          HTTP轮询：兼容性高但延迟大。
     */
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('生成ICE候选');
        const candidate: ICECandidate = {
          candidate: event.candidate.candidate, //
          sdpMLineIndex: event.candidate.sdpMLineIndex, //
          sdpMid: event.candidate.sdpMid, //
        };
        this.onICECandidate?.(candidate);
      }
    };

    /**
     * 远程媒体流到达事件
     * ontrack 是RTCPeerConnection 对象的一个关键事件处理器，接收远程媒体流（音频/视频）的轨道（Track）
        触发时机：当远程对端通过 addTrack() 或 addTransceiver() 添加媒体轨道，并成功建立连接后，本地会通过 ontrack 接收到这些轨道。
        核心功能：将远程的音频/视频数据绑定到本地媒体元素（如 <video> 或 <audio> ）进行播放或处理
        底层工作原理
          轨道协商：
          对端通过 SDP 协商确定支持的媒体类型（如 H.264 视频或 Opus 音频）。
          本地 ontrack 在收到轨道数据后自动触发。
          媒体流关联：
          一个 MediaStream 可包含多个轨道（如同时传输音频和视频）。
          通过 streams 数组可获取轨道所属的完整流上下文。
          传输控制：
          transceiver.direction 可动态调整轨道方向（如 sendrecv 、 recvonly ）
     * 当收到对端的音视频流时触发
     * 通常在这里将流绑定到video/audio元素
     */
    this.peerConnection.ontrack = (event) => {
      console.log('收到远程流');
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
        this.onRemoteStream?.(this.remoteStream);
      }
    };

    /**
     * 连接状态变化事件
     * 监控连接状态变化：new/connecting/connected/disconnected/failed/closed
     * 在失败时自动尝试清理和重置连接
     */
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      console.log('连接状态变化:', state);
      if (state) {
        this.onConnectionStateChange?.(state);
        
        // 连接失败时自动重置
        if (state === 'failed' || state === 'disconnected') {
          setTimeout(() => this.cleanup(), 1000);
        }
      }
    };

    /**
     * ICE连接状态事件
     * 监控ICE连接状态：new/checking/connected/completed/failed/disconnected/closed
     */
    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection?.iceConnectionState;
      console.log('ICE连接状态:', state);
    };

    /**
     * 重新协商事件
     * 当需要重新协商SDP时触发(如添加/删除轨道)
     */
    this.peerConnection.onnegotiationneeded = () => {
      console.log('需要重新协商');
    };
  }

  //获取用户媒体
  /**
   * 获取用户媒体流(麦克风)
   * 
   * 请求用户麦克风权限并获取音频流
   * 这是WebRTC通话的必要前置步骤
   * 
   * @returns {Promise<MediaStream>} 包含音频轨道的媒体流
   * @throws 如果用户拒绝权限或设备不可用
   * 
   * 注意：
   * 1. 必须在安全上下文(HTTPS/localhost)中调用
   * 2. 浏览器会显示权限请求弹窗
   * 3. 配置了回声消除/降噪等音频处理参数
   */
  async getUserMedia(): Promise<MediaStream> {
    try {
      console.log('请求麦克风权限');
      
      // 调用浏览器API获取媒体流
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,   // 启用回声消除
          noiseSuppression: true,   // 启用降噪
          autoGainControl: true,    // 启用自动增益控制
          sampleRate: 44100,        // 设置采样率(CD音质)
        },
        video: false,               // 不请求视频
      });
      
      console.log('获取音频流成功');
      this.localStream = stream;    // 保存到实例变量
      return stream;
    } catch (error) {
      console.error('获取音频流失败:', error);
      throw new Error('无法获取麦克风权限，请检查浏览器设置');
    }
  }

  // 创建offer
  /**
   * 创建Offer(发起方)
   * 
   * WebRTC信令流程的第一步，包含以下步骤：
   * 1. 检查连接状态
   * 2. 添加本地媒体轨道
   * 3. 创建SDP Offer
   * 4. 设置本地描述
   * 
   * @returns {Promise<RTCSessionDescriptionInit>} 生成的Offer SDP
   * @throws 如果PeerConnection未初始化或状态异常
   * 
   * 注意：
   * 1. 必须在stable状态下调用
   * 2. 生成的Offer需要通过信令服务器发送给对端
   * 3. 设置本地描述会触发ICE候选收集
   */
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.isInitialized || !this.peerConnection) {
      throw new Error('WebRTC未初始化');
    }

    try {
      console.log('创建Offer开始');
      console.log('初始信令状态:', this.peerConnection.signalingState);
      
      // 确保PeerConnection处于stable状态
      if (this.peerConnection.signalingState !== 'stable') {
        console.warn('PeerConnection状态不稳定，重置中...');
        this.reset();                // 重置连接
        await new Promise(resolve => setTimeout(resolve, 200)); // 等待重置完成
        
        if (!this.peerConnection) {
          throw new Error('重置后PeerConnection无效');
        }
      }
      
      // 添加本地媒体轨道(如果存在)
      if (this.localStream) {
        console.log('添加本地音频流到PeerConnection');
        
        // 检查是否已经添加过相同轨道(避免重复添加)
        const existingSenders = this.peerConnection.getSenders();
        console.log('现有发送者数量:', existingSenders.length);
        
        // 遍历本地流的所有轨道
        this.localStream.getTracks().forEach(track => {
          const existingSender = existingSenders.find(sender => sender.track === track);
          
          // 只添加未存在的轨道
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

      // 标记开始协商
      this.isNegotiating = true;
      
      // 创建Offer SDP
      console.log('开始创建Offer...');
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,   // 期望接收音频
        offerToReceiveVideo: false,  // 不期望接收视频
      });
      
      console.log('Offer创建完成，设置本地描述...');
      
      // 设置本地描述(触发ICE候选收集)
      await this.peerConnection.setLocalDescription(offer);
      
      // 验证最终状态
      const finalState = this.peerConnection.signalingState;
      console.log('Offer创建成功');
      console.log('最终信令状态:', finalState);
      console.log('Offer SDP长度:', offer.sdp?.length);
      
      // 检查状态是否符合预期
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

  // 处理offer并创建answer
  /**
   * 处理收到的Offer(应答方)
   * 
   * 这是WebRTC信令流程的第二步，包含以下步骤：
   * 1. 设置远程Offer描述
   * 2. 添加本地媒体轨道
   * 3. 创建Answer SDP
   * 4. 设置本地描述
   * 5. 处理暂存的ICE候选
   * 
   * @param {RTCSessionDescriptionInit} offer - 对端发来的Offer SDP
   * @returns {Promise<RTCSessionDescriptionInit>} 生成的Answer SDP
   * @throws 如果PeerConnection未初始化或处理失败
   * 
   * 注意：
   * 1. 生成的Answer需要通过信令服务器发送回发起方
   * 2. 设置本地描述会触发ICE候选收集
   */
  async handleOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.isInitialized || !this.peerConnection) {
      throw new Error('WebRTC未初始化');
    }

    try {
      console.log('处理Offer并创建Answer');
      
      // 设置远程Offer描述
      await this.peerConnection.setRemoteDescription(offer);
      
      // 添加本地媒体轨道(如果存在)
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
          this.peerConnection!.addTrack(track, this.localStream!);
        });
        console.log('本地流已添加');
      }
      
      // 创建Answer SDP
      const answer = await this.peerConnection.createAnswer();
      
      // 设置本地Answer描述
      await this.peerConnection.setLocalDescription(answer);
      
      // 处理之前暂存的任何ICE候选
      await this.processPendingIceCandidates();
      
      console.log('Answer创建成功');
      console.log('webrtc处理后：', this.peerConnection);
      return answer;
    } catch (error) {
      console.error('处理Offer失败:', error);
      throw new Error('处理通话请求失败');
    }
  }

  // 处理answer
  /**
   * 处理收到的Answer(发起方)
   * 
   * 这是WebRTC信令流程的最后一步，包含以下步骤：
   * 1. 验证当前状态
   * 2. 设置远程Answer描述
   * 3. 处理暂存的ICE候选
   * 
   * @param {RTCSessionDescriptionInit} answer - 对端发来的Answer SDP
   * @throws 如果PeerConnection未初始化或状态异常
   * 
   * 注意：
   * 1. 必须在have-local-offer状态下调用
   * 2. 设置远程描述后连接将开始建立
   */
  async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.isInitialized || !this.peerConnection) {
      throw new Error('WebRTC未初始化');
    }

    try {
      console.log('处理Answer开始');
      console.log('当前信令状态:', this.peerConnection.signalingState);
      console.log('Answer类型:', answer.type);
      
      // 验证当前状态(必须处于have-local-offer)
      if (this.peerConnection.signalingState !== 'have-local-offer') {
        console.warn('PeerConnection状态不正确，当前状态:', this.peerConnection.signalingState);
        console.warn('期望状态: have-local-offer，跳过Answer处理');
        return;
      }

      // 验证Answer有效性
      if (!answer || answer.type !== 'answer') {
        throw new Error('无效的Answer');
      }

      // 设置远程Answer描述
      await this.peerConnection.setRemoteDescription(answer);
      console.log('Answer设置成功，当前状态:', this.peerConnection.signalingState);
      
      // 处理之前暂存的任何ICE候选
      await this.processPendingIceCandidates();
      
      // 标记协商完成
      this.isNegotiating = false;
      console.log('Answer处理完成');
    } catch (error) {
      console.error('处理Answer失败:', error);
      this.isNegotiating = false;
      throw new Error('建立连接失败: ' + (error as Error).message);
    }
  }

  //添加ice候选
  /**
   * 添加ICE候选
   * 
   * 将对端发来的ICE候选添加到PeerConnection中
   * 如果PeerConnection未准备好，候选会被暂存
   * 
   * @param {ICECandidate} candidate - ICE候选对象
   * 
   * 注意：
   * 1. ICE候选用于建立P2P连接路径
   * 2. 候选可能在SDP交换前到达，需要暂存
   * 3. 候选添加顺序不影响连接建立
   */
  async addIceCandidate(candidate: ICECandidate): Promise<void> {
    if (!this.peerConnection) {
      console.warn('PeerConnection未初始化，暂存ICE候选');
      this.pendingIceCandidates.push(candidate);
      return;
    }

    // 如果远程描述未设置，暂存候选(等待setRemoteDescription)
    if (!this.peerConnection.remoteDescription) {
      console.log('远程描述未设置，暂存ICE候选');
      this.pendingIceCandidates.push(candidate);
      return;
    }

    try {
      // 将候选转换为RTCIceCandidate对象
      const rtcCandidate = new RTCIceCandidate({
        candidate: candidate.candidate,
        sdpMLineIndex: candidate.sdpMLineIndex,
        sdpMid: candidate.sdpMid,
      });
      
      // 添加候选到PeerConnection
      await this.peerConnection.addIceCandidate(rtcCandidate);
      console.log('ICE候选添加成功');
    } catch (error) {
      console.warn('添加ICE候选失败:', error);
    }
  }

  // 处理ICE候选
  /**
   * 处理暂存的ICE候选
   * 
   * 在远程描述设置完成后，处理之前暂存的所有ICE候选
   * 
   * 注意：
   * 1. 通常在setRemoteDescription后调用
   * 2. 按接收顺序处理候选
   * 3. 处理完成后清空暂存列表
   */
  private async processPendingIceCandidates(): Promise<void> {
    if (this.pendingIceCandidates.length === 0) return;
    
    console.log(`处理${this.pendingIceCandidates.length}个暂存的ICE候选`);
    
    // 按顺序处理所有暂存候选
    for (const candidate of this.pendingIceCandidates) {
      await this.addIceCandidate(candidate);
    }
    
    // 清空暂存列表
    this.pendingIceCandidates = [];
  }

  // 切换静音
  /**
   * 切换静音状态
   * 
   * 切换本地音频轨道的启用状态
   * 
   * @returns {boolean} 切换后的静音状态(true表示静音)
   * 
   * 注意：
   * 1. 不会停止轨道，只是禁用/启用
   * 2. 对端会收到静音通知(onmute事件)
   */
  toggleMute(): boolean {
    if (!this.localStream) return false;
    
    // 获取第一个音频轨道(通常只有一个)
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      // 切换轨道启用状态
      audioTrack.enabled = !audioTrack.enabled;
      console.log('静音状态:', !audioTrack.enabled);
      return !audioTrack.enabled;
    }
    return false;
  }

  // 获取连接状态
  /**
   * 获取连接统计信息
   * 
   * 返回包含各种连接指标的统计报告，可用于：
   * - 监控连接质量
   * - 诊断网络问题
   * - 显示带宽/延迟等指标
   * 
   * @returns {Promise<RTCStatsReport | null>} 统计报告对象
   */
  async getStats(): Promise<RTCStatsReport | null> {
    if (!this.peerConnection) return null;
    return await this.peerConnection.getStats();
  }

  // 清理
  /**
   * 清理WebRTC资源
   * 
   * 安全释放所有资源，包括：
   * 1. 停止所有媒体轨道
   * 2. 关闭PeerConnection
   * 3. 重置所有状态
   * 
   * 注意：
   * 1. 应该在通话结束或连接失败时调用
   * 2. 调用后需要重新initialize才能再次使用
   * 3. 会触发所有轨道的onended事件
   */
  cleanup(): void {
    console.log('清理WebRTC资源');
    
    // 停止并释放本地媒体流
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();  // 停止轨道(触发onended)
        console.log('停止音频轨道');
      });
      this.localStream = null;
    }

    // 关闭PeerConnection
    if (this.peerConnection) {
      this.peerConnection.close(); // 触发oniceconnectionstatechange
      this.peerConnection = null;
    }

    // 重置所有状态
    this.remoteStream = null;
    this.pendingIceCandidates = [];
    this.isInitialized = false;
    this.isNegotiating = false;
  }

  // 重置
  /**
   * 重置WebRTC连接
   * 
   * 先清理现有资源，然后重新初始化
   * 用于处理连接失败或需要重新建立连接的场景
   * 
   * 注意：
   * 1. 会触发所有状态回调
   * 2. 媒体权限需要重新获取
   */
  reset(): void {
    this.cleanup();      // 先清理
    this.initialize();   // 再初始化
  }

  /**
   * 错误处理
   * 
   * 统一处理WebRTC相关错误，包括：
   * 1. 记录错误日志
   * 2. 触发onError回调
   * 
   * @param {Error} error - 错误对象
   */
  private handleError(error: Error): void {
    console.error('WebRTC错误:', error);
    this.onError?.(error);
  }

  // ========== 状态获取方法 ==========
  
  /**
   * 是否已建立连接
   */
  get isConnected(): boolean {
    return this.peerConnection?.connectionState === 'connected';
  }

  /**
   * 当前连接状态
   */
  get connectionState(): RTCPeerConnectionState | null {
    return this.peerConnection?.connectionState || null;
  }

  /**
   * 本地媒体流
   */
  get localMediaStream(): MediaStream | null {
    return this.localStream;
  }

  /**
   * 远程媒体流
   */
  get remoteMediaStream(): MediaStream | null {
    return this.remoteStream;
  }

  /**
   * 获取完整状态信息
   * 
   * 返回包含所有关键状态的对象，可用于：
   * - 调试
   * - 状态监控
   * - UI展示
   * 
   * @returns {object|null} 状态对象或null(未初始化时)
   */
  getDetailedState() {
    if (!this.peerConnection) return null;
    
    return {
      signalingState: this.peerConnection.signalingState,       // 信令状态
      iceConnectionState: this.peerConnection.iceConnectionState, // ICE连接状态
      connectionState: this.peerConnection.connectionState,    // 整体连接状态
      iceGatheringState: this.peerConnection.iceGatheringState, // ICE收集状态
      isNegotiating: this.isNegotiating,                        // 是否正在协商
      hasLocalStream: !!this.localStream,                      // 是否有本地流
      hasRemoteStream: !!this.remoteStream,                     // 是否有远程流
    };
  }
  
}