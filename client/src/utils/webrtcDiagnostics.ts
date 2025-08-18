// WebRTC诊断和调试工具
export class WebRTCDiagnostics {
  /**
   * 检查浏览器WebRTC支持
   */
  static checkBrowserSupport(): { supported: boolean; issues: string[] } {
    const issues: string[] = [];
    let supported = true;

    // 检查基本API
    if (!window.RTCPeerConnection) {
      issues.push('浏览器不支持RTCPeerConnection');
      supported = false;
    }

    if (!navigator.mediaDevices) {
      issues.push('浏览器不支持MediaDevices API');
      supported = false;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      issues.push('浏览器不支持getUserMedia');
      supported = false;
    }

    // 检查HTTPS要求
    if (location.protocol !== 'https:' && 
        location.hostname !== 'localhost' && 
        location.hostname !== '127.0.0.1') {
      issues.push('WebRTC需要HTTPS环境，当前为HTTP可能导致功能受限');
    }

    return { supported, issues };
  }

  /**
   * 检查网络连接
   */
  static async checkNetworkConnectivity(): Promise<{ connected: boolean; issues: string[] }> {
    const issues: string[] = [];
    let connected = true;

    try {
      // 检查基本网络连接
      if (!navigator.onLine) {
        issues.push('设备离线');
        connected = false;
        return { connected, issues };
      }

      // 测试STUN服务器连接
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' }
        ]
      });

      const candidates: RTCIceCandidate[] = [];
      
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          pc.close();
          issues.push('STUN服务器连接超时，可能存在网络问题');
          resolve({ connected: false, issues });
        }, 5000);

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            candidates.push(event.candidate);
            
            // 收到候选后说明网络基本正常
            clearTimeout(timeout);
            pc.close();
            
            if (candidates.length === 0) {
              issues.push('未能获取ICE候选，网络可能受限');
              connected = false;
            }
            
            resolve({ connected, issues });
          }
        };

        // 创建offer触发ICE收集
        pc.createOffer().then(offer => {
          pc.setLocalDescription(offer);
        }).catch(() => {
          clearTimeout(timeout);
          pc.close();
          issues.push('创建WebRTC Offer失败');
          resolve({ connected: false, issues });
        });
      });

    } catch (error) {
      issues.push('网络连接检查失败: ' + (error as Error).message);
      return { connected: false, issues };
    }
  }

  /**
   * 检查麦克风权限和设备
   */
  static async checkMicrophoneAccess(): Promise<{ accessible: boolean; issues: string[] }> {
    const issues: string[] = [];
    let accessible = true;

    try {
      // 检查权限状态
      if (navigator.permissions) {
        const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        if (permission.state === 'denied') {
          issues.push('麦克风权限被拒绝');
          accessible = false;
        }
      }

      // 检查设备列表
      if (navigator.mediaDevices?.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === 'audioinput');
        
        if (audioInputs.length === 0) {
          issues.push('未找到音频输入设备');
          accessible = false;
        }
      }

      // 尝试获取音频流
      if (accessible) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          stream.getTracks().forEach(track => track.stop()); // 立即停止
        } catch (error) {
          if (error instanceof Error) {
            if (error.name === 'NotAllowedError') {
              issues.push('麦克风权限被用户拒绝');
            } else if (error.name === 'NotFoundError') {
              issues.push('未找到麦克风设备');
            } else if (error.name === 'NotReadableError') {
              issues.push('麦克风被其他应用占用');
            } else {
              issues.push('获取麦克风失败: ' + error.message);
            }
          }
          accessible = false;
        }
      }

    } catch (error) {
      issues.push('麦克风检查失败: ' + (error as Error).message);
      accessible = false;
    }

    return { accessible, issues };
  }

  /**
   * 运行完整诊断
   */
  static async runFullDiagnostics() {
    console.log('🔍 开始WebRTC诊断...');
    
    const browserCheck = this.checkBrowserSupport();
    console.log('📱 浏览器支持:', browserCheck);
    
    if (!browserCheck.supported) {
      console.error('❌ 浏览器不支持WebRTC，无法继续');
      return { success: false, issues: browserCheck.issues };
    }

    const micCheck = await this.checkMicrophoneAccess();
    console.log('🎤 麦克风检查:', micCheck);

    const networkCheck = await this.checkNetworkConnectivity();
    console.log('🌐 网络连接:', networkCheck);

    const allIssues = [
      ...browserCheck.issues,
      ...micCheck.issues,
      ...networkCheck.issues
    ];

    const success = browserCheck.supported && micCheck.accessible && networkCheck.connected;
    
    console.log(success ? '✅ WebRTC诊断通过' : '❌ WebRTC诊断发现问题');
    if (allIssues.length > 0) {
      console.log('问题列表:', allIssues);
    }

    return { success, issues: allIssues };
  }
}