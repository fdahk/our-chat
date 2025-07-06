// 全局 socket 监听器，监听 socket 消息，并更新全局消息状态,在app.tsx中使用
import { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { type UserState } from '../store/userStore';
import SocketService from './socket';
import { addGlobalMessage } from '../store/chatStore';
import type { Message } from '../globalType/message';

export default function GlobalSocketListener() {
  const userId = useSelector((state: UserState) => state.id);
  const dispatch = useDispatch();
  const socket = SocketService.getInstance();
  
    // 注：这里监听的是全局消息，消息派发逻辑由后端实现，更新redux状态全局消息，同时触发组件重新渲染
    useEffect(() => {
      socket.connect(); // 连接socket
      socket.emit('connection', { userId }); // 发送连接事件，后端监听connection事件

      // 新消息处理函数
      const handleMessage = (msg: Message) => {
              // setState 可以接受两种参数：
              // 直接值 ：setMessages(newMessages);
              // 函数式更新 ：注： 当某个会话是第一次收到消息时，其结构为[id] : undefined，需要使用空数组初始化
              // 注： 消息更新在chatView组件中，这里仅更新redux状态全局消息
              // setMessages((prev) => ({ ...prev, [msg.conversationId]: [...(prev[msg.conversationId] ?? []) , msg] }));
              dispatch(addGlobalMessage(msg)); // 更新redux状态全局消息
              // 消息提示音,注：浏览器获取资源应当使用基于浏览器根目录的路径
              const audio = new Audio('src/assets/audios/message.wav');
              audio.play();
      };

      // 仅监听 receiveMessage 事件，更新消息列表，消息派发逻辑由后端实现
      socket.on('receiveMessage', handleMessage);

      return () => {
          socket.off('receiveMessage', handleMessage); // 退出登录时，移除事件监听
          socket.disconnect(); // 断开socket连接
          //注：在 socket.io-client 中，"disconnect" 是内置的保留事件名，内部自动管理，仅能.on 监听和使用它，不能.emit 和 .off
          // socket.emit('disconnect', { userId }); 
      };
  }, [userId]);
  // dispatch依赖的解释：
  // React Hook 规则：useEffect 的依赖数组必须包含所有外部变量，不包含 dispatch，ESLint 会警告
  // dispatch通常是稳定的

  return null;
}
