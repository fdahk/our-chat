// PayloadAction 是 TypeScript 类型，用于定义 action 的 payload 类型
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Message } from '../globalType/message';
import type { ConvMessage, Conversation } from '../globalType/conversation';
import storage from 'redux-persist/lib/storage';
import { persistReducer } from 'redux-persist';

// 聊天状态类型
export interface ChatState {
  globalMessages: ConvMessage, //注：数据结构为 { [conversationId: string]: Message[] , ... }
  globalConversations: Conversation[], 
}


// 初始状态
// 注：数据结构为 state.globalMessages: { [conversationId: string]: Message[] , ... }
const initialState: ChatState = {
  globalMessages: {},
  globalConversations: [],
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
    initGlobalMessages(state, action: PayloadAction<ConvMessage>) {
      state.globalMessages = action.payload;
    },
    addGlobalMessage(state, action: PayloadAction<Message>) {
      // state.globalMessages[action.payload.conversationId].push(action.payload); //将新消息添加到全局消息数组
      state.globalMessages = {
        ...state.globalMessages,
        [action.payload.conversationId]: [...(state.globalMessages[action.payload.conversationId] ?? []), action.payload]
      };
      // console.log("添加全局消息"); // 调试
    },
    clearGlobalMessages(state) {
      state.globalMessages = {};
    },
    // 会话管理
    initGlobalConversations(state, action: PayloadAction<Conversation[]>) {
      state.globalConversations = action.payload;
    },
    addConversation(state, action: PayloadAction<Conversation>) {
      state.globalConversations.push(action.payload);
    },
    updateConversation(state, action: PayloadAction<Conversation>) {
      const { id, ...rest } = action.payload;
      state.globalConversations = state.globalConversations.map(conversation => conversation.id === id ? { ...conversation, ...rest } : conversation);
    },
    deleteConversation(state, action: PayloadAction<string>) {
      state.globalConversations = state.globalConversations.filter(conversation => conversation.id !== action.payload);
    }
  },
});

// 配置 persist 持久化
const persistConfig = {
  key: 'chat',
  storage,
  whitelist: ['globalMessages', 'globalConversations'],
};
const persistedChatReducer = persistReducer(persistConfig, chatSlice.reducer);



//chatSlice.actions 是 createSlice 自动生成的一个对象，包含了所有的 action creators工厂函数，用于创建action
export const { initGlobalMessages, initGlobalConversations, addGlobalMessage, clearGlobalMessages,
                addConversation, updateConversation, deleteConversation } = chatSlice.actions;

//处理 所有action：根据 action.type 使用reducer函数（ Immer库）执行对应的状态更新逻辑
//在组件中使用：通过 useSelector 获取状态，useDispatch 分发 action，实现状态管理
// export default chatSlice.reducer;
export default persistedChatReducer; // 导出持久化包装的 reducer,用于获取数据

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
