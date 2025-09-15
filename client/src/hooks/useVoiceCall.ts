import { useCallback, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../store/rootStore';
import { WebRTCManager } from '../utils/webrtc';
import SocketService from '../utils/socket';
import {
  startCall,
  receiveCall,
  connectCall,
  endCall,
  resetCall,
  setLocalStream,
  setRemoteStream,
  toggleMute as toggleMuteAction,
  updateDuration,
  setError,
} from '../store/callStore';
import type { CallUser, CallAcceptEvent, CallRejectEvent, CallEndEvent, CallIceEvent, CallStartEvent } from '../globalType/call';
import { message } from 'antd';


export const useVoiceCall = () => {
  const dispatch = useDispatch();
  const callState = useSelector((state: RootState) => state.call);//通话状态
  const currentUser = useSelector((state: RootState) => state.user);// 当前用户
  
  const webrtcRef = useRef<WebRTCManager | null>(null); // WebRTC 管理器类引用
  const socketRef = useRef(SocketService.getInstance()); // Socket引用
  const durationTimerRef = useRef<NodeJS.Timeout | null>(null); // 通话时长计时器

  // 添加事件处理标记，防止重复处理
  const processedEvents = useRef<Set<string>>(new Set());
  
  // 使用ref存储当前callId，避免闭包问题
  const currentCallIdRef = useRef<string | null>(null);
  
  // 防止重复发送accept的标记
  const acceptSentRef = useRef<Set<string>>(new Set());

  // 初始化WebRTC管理器
  useEffect(() => {
    webrtcRef.current = new WebRTCManager();
    const webrtc = webrtcRef.current;
    
    // 远程流回调
    webrtc.onRemoteStream = (stream) => {
      console.log('收到远程音频流');
      // 轨道：audio/video
      console.log('远程流轨道数量:', stream.getTracks().length);
      stream.getTracks().forEach(track => {
        console.log(`远程轨道: ${track.kind}, enabled: ${track.enabled}`);
      });
      // 存到store，方便其他组件共享处理音频流
      dispatch(setRemoteStream(stream));
    };
    
    // ICE候选回调
    webrtc.onICECandidate = (candidate) => {
      // 使用ref获取最新的callId，避免闭包问题
      const currentCallId = currentCallIdRef.current;
      if (currentCallId) {
        console.log('生成ICE候选，发送给对端');
        console.log('候选类型:', candidate.candidate?.split(' ')[7]); // host/srflx/relay等
        socketRef.current.emit('call:ice', {
          callId: currentCallId,
          candidate,
        });
      } else {
        console.warn('收到ICE候选但没有活跃通话，忽略');
        console.log('当前callId ref:', currentCallIdRef.current);
      }
    };
    
    // 连接状态变化回调
    webrtc.onConnectionStateChange = async (state) => {
      console.log('WebRTC连接状态变化:', state);
      
      if (state === 'connected') {
        console.log('WebRTC连接建立成功，开始通话');
        dispatch(connectCall());
        startDurationTimer();
        message.success('通话连接成功');
      } else if (state === 'connecting') {
        console.log('WebRTC正在建立连接...');
      } else if (state === 'failed') {
        console.error('WebRTC连接失败');
        handleConnectionFailed();
      } else if (state === 'disconnected') {
        console.warn('WebRTC连接断开');
        // 注意：断开不立即清理，给浏览器重连机会
      }
    };
    
    // 错误回调
    webrtc.onError = (error) => {
      console.error('WebRTC错误:', error);
      dispatch(setError(error.message));
      message.error(`通话错误: ${error.message}`);
    };

    return () => {
      if (webrtcRef.current) {
        webrtcRef.current.cleanup();
        webrtcRef.current = null;
      }
      stopDurationTimer();
    };
  }, []);

  // Socket事件监听
  useEffect(() => {
    const socket = socketRef.current;

    // 收到通话邀请
    const handleCallStart = async (event: CallStartEvent) => {
      console.log('收到通话邀请:', event.callId);
      
      try {
        if (!currentUser) {
          throw new Error('用户未登录');
        }

        // 更新store状态，保存offer,SDP保存在点击接受通话中处理
        dispatch(receiveCall({
          callId: event.callId,
          localUser: {
            id: currentUser.id,
            username: currentUser.username,
            nickname: currentUser.nickname,
            avatar: currentUser.avatar,
          },
          remoteUser: event.from,
          offer: event.offer, // 保存offer
        }));

        // 显示通话邀请
        message.info(`${event.from.nickname} 向您发起语音通话`);
        
      } catch (error) {
        console.error(' 处理通话邀请失败:', error);
        message.error('处理通话邀请失败');
      }
    };

    // 通话被接受
    const handleCallAccept = async (event: CallAcceptEvent) => {
      console.log('收到通话接受事件:', event.callId);

      // 重复处理检查
      if (processedEvents.current.has(`accept_${event.callId}`)) {
        console.log('重复的accept事件，跳过处理');
        return;
      }
      
      // 检查WebRTC状态，如果已经是stable说明已经处理过Answer
      if (webrtcRef.current?.getDetailedState()?.signalingState === 'stable') {
        console.log('WebRTC状态已是stable，跳过重复的Answer处理');
        return;
      }
      
      processedEvents.current.add(`accept_${event.callId}`);
      
      console.log('通话被接受:', event.callId, '当前callId:', callState.callId);
      
      try {
        if (!webrtcRef.current) {
          console.error('WebRTC管理器不存在');
          return;
        }
        
        if (event.callId !== callState.callId) {
          console.warn('忽略无关的accept事件', { 
            eventCallId: event.callId, 
            currentCallId: callState.callId 
          });
          return;
        }

        // 详细状态检查和日志
        const state = webrtcRef.current.getDetailedState();
        console.log('处理Answer前的详细状态:', state);

        // 处理Answer
        // WebRTC标准允许在某些情况下状态可能不是严格的have-local-offer
        await webrtcRef.current.handleAnswer(event.answer);
        console.log('Answer处理完成，等待连接建立');
        
      } catch (error) {
        console.error('处理Answer失败:', error);
        dispatch(setError('连接建立失败: ' + (error as Error).message));
        message.error('连接建立失败');
        
        // 清理事件标记，允许重试
        processedEvents.current.delete(`accept_${event.callId}`);
      }
    };

    // 通话被拒绝
    const handleCallReject = (event: CallRejectEvent) => {
      console.log('通话被拒绝:', event.callId);
      if (event.callId === callState.callId) {
        dispatch(endCall());
        message.info('对方拒绝了通话');
        cleanup();
      }
    };

    // 通话结束
    const handleCallEnd = (event: CallEndEvent) => {
      if (event.callId === callState.callId) {
        dispatch(endCall());
        message.info('通话已结束');
        cleanup();
      }
    };

    // ICE候选交换
    const handleCallIce = async (event: CallIceEvent) => {
      try {
        if (!webrtcRef.current) {
          console.warn('WebRTC管理器不存在，忽略ICE候选');
          return;
        }
        
        if (event.callId !== callState.callId) {
          console.warn('ICE候选callId不匹配，忽略', {
            eventCallId: event.callId,
            currentCallId: callState.callId
          });
          return;
        }
        
        console.log('候选类型:', event.candidate.candidate?.split(' ')[7]);
        await webrtcRef.current.addIceCandidate(event.candidate);
        console.log('ICE候选处理成功');
        
      } catch (error) {
        console.warn('处理ICE候选失败:', error);
        // ICE候选失败不应该中断通话，继续尝试其他候选
      }
    };

    // 绑定事件监听器
    socket.on('call:start', handleCallStart);
    socket.on('call:accept', handleCallAccept);
    socket.on('call:reject', handleCallReject);
    socket.on('call:end', handleCallEnd);
    socket.on('call:ice', handleCallIce);

    // 清理监听器
    return () => {
      console.log('清理Socket事件监听器');
      processedEvents.current.clear();
      socket.off('call:start', handleCallStart);
      socket.off('call:accept', handleCallAccept);
      socket.off('call:reject', handleCallReject);
      socket.off('call:end', handleCallEnd);
      socket.off('call:ice', handleCallIce);
    };
  }, [callState.callId, currentUser, dispatch]);

  // 同步callId到ref，避免ICE候选回调中的闭包问题
  useEffect(() => {
    currentCallIdRef.current = callState.callId;
    console.log('callId已同步到ref:', callState.callId);
  }, [callState.callId]);

  // 工具函数
  const startDurationTimer = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
    }
    durationTimerRef.current = setInterval(() => {
      dispatch(updateDuration());
    }, 1000);
  }, [dispatch]);

  const stopDurationTimer = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  }, []);

  const handleConnectionFailed = useCallback(() => {
    console.warn('WebRTC连接失败');
    dispatch(setError('网络连接失败'));
    message.error('网络连接失败，请检查网络设置');
    cleanup();
  }, [dispatch]);

  const cleanup = useCallback(() => {
    console.log('清理通话资源');
    
    stopDurationTimer();
    
    if (webrtcRef.current) {
      webrtcRef.current.cleanup();
    }
    
    dispatch(setLocalStream(null));
    dispatch(setRemoteStream(null));
    
    // 清理所有事件处理标记
    processedEvents.current.clear();
    acceptSentRef.current.clear();
    currentCallIdRef.current = null;
    
    setTimeout(() => {
      dispatch(resetCall());
    }, 3000);
  }, [dispatch, stopDurationTimer]);

  // 发起通话
  const initiateCall = useCallback(async (targetUser: CallUser) => {
    console.log('发起通话给:', targetUser.username);
    
    try {
      if (!currentUser) {
        throw new Error('用户未登录');
      }

      if (!webrtcRef.current) {
        throw new Error('WebRTC服务不可用');
      }

      const callId = `call_${currentUser.id}_${targetUser.id}_${Date.now()}`;
      
      // 1. 先更新状态
      dispatch(startCall({
        callId,
        localUser: {
          id: currentUser.id,
          username: currentUser.username,
          nickname: currentUser.nickname,
          avatar: currentUser.avatar,
        },
        remoteUser: targetUser,
      }));

      // 2. 重置WebRTC状态，确保干净开始
      console.log('重置WebRTC状态，确保干净的连接开始');
      webrtcRef.current.reset();
      await new Promise(resolve => setTimeout(resolve, 200));
      console.log('WebRTC状态重置完成');

      // 3. 获取本地音频流
      console.log('获取麦克风权限...');
      const localStream = await webrtcRef.current.getUserMedia();
      dispatch(setLocalStream(localStream));
      console.log('麦克风权限获取成功');

      // 4. 创建offer (WebRTC管理器会自动处理轨道添加)
      console.log('创建通话请求(Offer)...');
      const offer = await webrtcRef.current.createOffer();
      
      // 5. 验证offer创建后的状态
      const stateAfterOffer = webrtcRef.current.getDetailedState();
      console.log('Offer创建后状态:', stateAfterOffer);
      
      if (stateAfterOffer?.signalingState !== 'have-local-offer') {
        throw new Error(`Offer创建后状态异常: ${stateAfterOffer?.signalingState}`);
      }

      // 6. 发送通话邀请
      // 注意：setLocalDescription后会自动开始ICE候选收集
      // ICE候选会通过onicecandidate事件异步发送给对端
      console.log('发送通话邀请，ICE候选收集已启动');
      socketRef.current.emit('call:start', {
        callId,
        from: {
          id: currentUser.id,
          username: currentUser.username,
          nickname: currentUser.nickname,
          avatar: currentUser.avatar,
        },
        to: targetUser,
        offer, // SDP 对象
      });

      console.log('通话发起成功，等待对方接受');
      
    } catch (error) {
      console.error('发起通话失败:', error);
      const errorMessage = error instanceof Error ? error.message : '发起通话失败';
      dispatch(setError(errorMessage));
      message.error(errorMessage);
      cleanup();
    }
  }, [currentUser, dispatch, cleanup]);

  // 接受通话
  const acceptCall = useCallback(async () => {
    console.log('开始接受通话流程');
    
    try {
      if (!webrtcRef.current || !callState.callId || !callState.pendingOffer) {
        throw new Error('通话状态异常');
      }

      // 1. 重置WebRTC状态，确保干净的开始
      console.log('重置WebRTC状态，确保干净的连接开始');
      webrtcRef.current.reset();
      
      // 等待重置完成
      await new Promise(resolve => setTimeout(resolve, 200));
      console.log('WebRTC状态重置完成');

      // 2. 获取本地音频流
      const localStream = await webrtcRef.current.getUserMedia();
      dispatch(setLocalStream(localStream));
      console.log('麦克风权限获取成功');

      // 3. 状态检查
      const stateBefore = webrtcRef.current.getDetailedState();
      console.log('处理Offer前状态:', stateBefore);

      // 4. 处理offer并创建answer
      console.log('处理Offer并创建Answer...');
      const answer = await webrtcRef.current.handleOffer(callState.pendingOffer);

      // 5. 状态检查
      const stateAfter = webrtcRef.current.getDetailedState();
      console.log('创建Answer后状态:', stateAfter);

      // 6. 发送answer（防重复发送）
      const acceptKey = `accept_sent_${callState.callId}`;
      if (acceptSentRef.current.has(acceptKey)) {
        console.log('Answer已发送，跳过重复发送');
        return;
      }
      
      acceptSentRef.current.add(acceptKey);
      console.log('发送Answer给发起方');
      socketRef.current.emit('call:accept', {
        callId: callState.callId,
        from: callState.localUser?.id,
        to: callState.remoteUser?.id,
        answer,
      });

      console.log('通话接受成功，等待连接建立');
      
    } catch (error) {
      console.error('接受通话失败:', error);
      const errorMessage = error instanceof Error ? error.message : '接受通话失败';
      dispatch(setError(errorMessage));
      message.error(errorMessage);
      cleanup();
    }
  }, [callState.callId, callState.pendingOffer, callState.localUser, callState.remoteUser, dispatch, cleanup]);

  // 拒绝通话
  const rejectCall = useCallback(() => {
    console.log('拒绝通话');
    
    if (callState.callId) {
      socketRef.current.emit('call:reject', {
        callId: callState.callId,
      });
    }
    
    dispatch(endCall());
    cleanup();
  }, [callState.callId, dispatch, cleanup]);

  // 结束通话
  const terminateCall = useCallback(() => {
    console.log('结束通话');
    
    if (callState.callId) {
      socketRef.current.emit('call:end', {
        callId: callState.callId,
      });
    }
    
    dispatch(endCall());
    cleanup();
  }, [callState.callId, dispatch, cleanup]);

  // 切换静音
  const toggleMute = useCallback(() => {
    if (webrtcRef.current) {
      const isMuted = webrtcRef.current.toggleMute();
      dispatch(toggleMuteAction());
      return isMuted;
    }
    return false;
  }, [dispatch]);

  // WebRTC状态监听
  useEffect(() => {
    if (webrtcRef.current) {
      const interval = setInterval(() => {
        const state = webrtcRef.current?.getDetailedState();
        if (state && callState.isActive) {
          // console.log('WebRTC状态监控:', state);
        }
      }, 2000);
      
      return () => clearInterval(interval);
    }
  }, [callState.isActive]);

  return {
    callState,
    initiateCall,
    acceptCall,
    rejectCall,
    terminateCall,
    toggleMute,
  };
};