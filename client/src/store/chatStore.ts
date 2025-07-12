//注：该redux是为了解决消息的实时性问题，当用户收到消息时，更新redux状态，再同步组件重新渲染
// PayloadAction 是 TypeScript 类型，用于定义 action 的 payload 类型
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Message } from '@/globalType/message';
import type { Conversation, UserConversation } from '@/globalType/chat';
import type { Friend, FriendInfoList } from '@/globalType/friend';

// 聊天状态类型
interface ChatState {
  globalMessages: Message[], 
  globalUserConversations: UserConversation[], 
  globalConversations: Conversation[], 
  globalFriendList: Friend[],
  globalFriendInfoList: FriendInfoList,
  activeConversation: string | null,
  lastMessages: Record<string, Message>, // TS工具类型
}


// 初始状态
const initialState: ChatState = {
  globalMessages: [],
  globalUserConversations: [],
  globalConversations: [],
  globalFriendList: [],
  globalFriendInfoList: {},
  activeConversation: null,
  lastMessages: {},
};


// createSlice 简化redux创建过程：
// 自动生成 action creators（setUserInfo, logout）
// 自动生成 action types（user/setUserInfo, user/logout），使用 Immer 库，可以直接修改 state（不需要返回新对象），简化传统 Redux 的样板代码
const chatSlice = createSlice({
  name: 'chat', //slice 的名称，用于生成 action types（提供前缀
  initialState, //初始state

  // reducers 是一个对象，包含多个 reducer 函数。每个函数对应一个 action，用于处理特定的状态更新
  reducers: {
    //自动使用action creator工厂函数创造action
    //action 的结构：{type: 'chat/addGlobalMessage', payload: Message} ，type自动生成，payload是传入的参数
    // 全局消息管理
    initGlobalMessages(state, action: PayloadAction<Message[]>) {
      state.globalMessages = action.payload;
    },
    addGlobalMessage(state, action: PayloadAction<Message>) {
      // state.globalMessages[action.payload.conversationId].push(action.payload); //将新消息添加到全局消息数组
      state.globalMessages.push(action.payload);
      // console.log("添加全局消息"); // 调试
    },
    // 会话管理
    initGlobalUserConversations(state, action: PayloadAction<UserConversation[]>) {
      state.globalUserConversations = action.payload;
    },
    initGlobalConversations(state, action: PayloadAction<Conversation[]>) {
      state.globalConversations = action.payload;
    },
    addUserConversation(state, action: PayloadAction<UserConversation>) {
      state.globalUserConversations.push(action.payload);
    },
    addConversation(state, action: PayloadAction<Conversation>) {
      state.globalConversations.push(action.payload);
    },
    // 好友管理
    initGlobalFriendList(state, action: PayloadAction<{ friend_id: number, remark: string | null }[]>) {
      state.globalFriendList = action.payload;
    },
    initGlobalFriendInfoList(state, action: PayloadAction<FriendInfoList>) {
      state.globalFriendInfoList = action.payload;
    },
    // 设置当前会话
    initActiveConversation(state, action: PayloadAction<string | null>) {
      state.activeConversation = action.payload;
    },
    // 设置最后一条消息
    initLastMessages(state, action: PayloadAction<Record<string, Message>>) {
      state.lastMessages = action.payload;
    },
    addLastMessage(state, action: PayloadAction<{ conversationId: string, message: Message }>) {
      state.lastMessages[action.payload.conversationId] = action.payload.message;
    },
  },
});

// 注：废除持久化
// 配置 persist 持久化
// const persistConfig = {
//   key: 'chat',
//   storage,
//   whitelist: ['globalMessages', 'globalConversations'],
// };
// const persistedChatReducer = persistReducer(persistConfig, chatSlice.reducer);



//chatSlice.actions 是 createSlice 自动生成的一个对象，包含了所有的 action creators工厂函数，用于创建action修改state
export const { initGlobalMessages, initGlobalUserConversations, initGlobalConversations, addGlobalMessage,
                addUserConversation, addConversation, initGlobalFriendList, initGlobalFriendInfoList, initActiveConversation, 
                initLastMessages, addLastMessage } = chatSlice.actions;

//处理 所有action：根据 action.type 使用reducer函数（ Immer库）执行对应的状态更新逻辑
//在组件中使用：通过 useSelector 获取状态，useDispatch 分发 action，实现状态管理
// export default chatSlice.reducer;

// 必须导出持久化包装的 reducer给rootStore使用，rootStore是整个 React 应用唯一的数据源
// 在rootStore 里用哪个 reducer，组件中使用 useSelector、useDispatch 访问到的就是哪个 reducer 管理的状态
// 必须提供rootstore 持久化包装后的 reducer，redux-persist 才能拦截所有 action，自动存储和恢复状态。
export default chatSlice.reducer; 

//reducer作用详解：
// 组件中 useSelector 读取状态
// const chatState = useSelector((state) => state.chat);
// 这里的 state.chat 就是由 chatReducer 管理的状态

// 组件中 useDispatch 分发 action
// dispatch(addGlobalMessage(newMessage));
// 这个 action 会被发送给 chatReducer 处理

// chatReducer 处理 action
// chatSlice.reducer 函数被调用，更新状态
// 新状态: { globalMessages: [newMessage] }

// 组件中 useSelector 获取新状态
// 组件重新渲染，useSelector 获取到更新后的状态
