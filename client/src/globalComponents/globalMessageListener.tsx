// 全局 socket 监听器，监听 socket 消息，并更新全局消息状态,在app.tsx中使用
import { useEffect} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import SocketService from '../utils/socket';
import { addGlobalMessage, initGlobalUserConversations, initGlobalConversations, initGlobalFriendList, initGlobalFriendInfoList } from '@/store/chatStore';
import type { Message } from '@/globalType/message';
import { getUserConversationList, getConversationList } from '@/globalApi/chatApi';
import { getFriendList } from '@/globalApi/friendApi';
import type { ApiResponse } from '@/globalType/apiResponse';
import type { UserConversation, Conversation } from '@/globalType/chat';

export default function GlobalMessageListener() {

  // const userId = useSelector((state: UserState) => state.id);
  const user = JSON.parse(localStorage.getItem('persist:user') as string);
  const userId: number = user.id; // 注：Number类型
  // console.log(userId); // 调试
  const dispatch = useDispatch();
  const socket = SocketService.getInstance();
  // 注：不能使用这个用于下面获取会话列表，因为redux状态更新是异步的，不能保证在获取会话列表时，redux状态已经更新
  // const globalUserConversations = useSelector((state: any) => state.chat.globalUserConversations); // 从redux中获取全局用户会话列表
    // 注：这里监听的是全局消息，消息派发逻辑由后端实现，更新redux状态全局消息，同时触发组件重新渲染
    useEffect(() => { 
      // 首次启动应用先从后端获取会话列表和全局消息存到本地 
      // Promise 链式调用，比传统async/await更简洁，回调函数更是古代的写法
      // 获取用户会话列表
      getUserConversationList(userId).then(async (res1: ApiResponse<UserConversation[]>) => {
        await dispatch(initGlobalUserConversations(res1.data ?? []));
        // 获取会话列表
        //注：必须使用最新的res1的值，redux更新是异步的，而且该组件获取的redux状态是初始值即使上面调用接口后更新了，这里的数据依然是旧的
        getConversationList(res1.data ?? []).then((res2: ApiResponse<Conversation[]>) => {
          dispatch(initGlobalConversations(res2.data ?? []));
        });

      });

      // 获取好友及好友信息列表
      getFriendList(user.id).then(res => {
        dispatch(initGlobalFriendList(res.data.friendId)); //返回好友id
        dispatch(initGlobalFriendInfoList(res.data.friendInfo)); //返回好友信息
    });
       // 连接socket
      socket.connect();
      socket.emit('join', userId); // 发送连接事件，后端处理连接后的配置（加入会话等

      // 新消息处理函数
      const handleMessage = (msg: Message) => {
              // setState 可以接受两种参数：
              // 直接值 ：setMessages(newMessages);
              // 函数式更新 ：注： 当某个会话是第一次收到消息时，其结构为[id] : undefined，需要使用空数组初始化
              // 注： 消息更新在chatView组件中，这里仅更新redux状态全局消息
              // setMessages((prev) => ({ ...prev, [msg.conversationId]: [...(prev[msg.conversationId] ?? []) , msg] }));
              dispatch(addGlobalMessage(msg)); //及时更新消息
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
