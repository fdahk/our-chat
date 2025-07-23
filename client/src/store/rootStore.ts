// 注：
import { configureStore,combineReducers } from '@reduxjs/toolkit';
import { persistStore, persistReducer } from 'redux-persist';
import storage from 'redux-persist/lib/storage';
import UserReducer from './userStore'; // 导入 reducer
import chatReducer from './chatStore'; // 同上
import friendReqReducer from './friendStore'; // 同上

const rootPersistConfig = {
  key: 'root',
  storage,
  whitelist: ['user'], // 需要持久化的 slice
};

// 合并所有reducer（每个reducer都自动管理自己的state）使root能处理所有模块状态的 reducer
const rootReducers = {
  user: UserReducer,
  chat: chatReducer,
  friendReq: friendReqReducer,
};
// 合并所有reducer
const rootReducer = combineReducers(rootReducers);

// 高阶函数：进一步包装reducer ，实现全局重置 action + 合并所有 reducer
const RESET_STORE = 'RESET_STORE'; //定义重置操作的action类型
const rootReducerWithReset = (state: any, action: any) => {
  if (action.type === RESET_STORE) {
    // 传入 undefined，触发所有 reducer 的初始状态
    // 当 reducer 收到 undefined 时，会返回初始状态
    // 效果：直接调用总reducer，会间接调用所有子 reducer，所有子 reducer 都会重置到初始状态
    // 为什么要return？
    return rootReducer(undefined, action);
  }
  return rootReducer(state, action);
};
// 创建一个 action creator 函数，返回一个 action 对象 
export const resetStore = () => ({
  type: RESET_STORE
});

// 配置持久化reducer
const persistedReducer = persistReducer(rootPersistConfig, rootReducerWithReset);

// 合并统一配置store，并持久化
// 推荐只能有一个store：否则
// 组件之间无法直接共享数据，全局状态被割裂，数据同步变得复杂且容易出错。
// 中间件、持久化等功能失效：redux-persist、redux-thunk、redux-saga 等中间件和工具，默认只支持单一 store。
// 多 store 时，持久化、DevTools、异步 action 等功能会变得混乱或失效。
export const rootStore = configureStore({
  reducer: persistedReducer, //用合并的reducer作为reducer
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});


// 持久化的store和持久化的reducer有什么区别？---
export const rootPersistor = persistStore(rootStore); // 导出持久化的store
// typeof rootStore.getState： 自动推导出 Redux store 的全局 state 类型（即整个 Redux 状态树的类型）
//  用于在使用 useSelector 时获得完整的类型提示和类型检查
export type RootState = ReturnType<typeof rootStore.getState>; // 导出store的state类型
// 根 store 本身不定义业务 action，它只是把各个 slice 的 reducer 合并起来

export type AppDispatch = typeof rootStore.dispatch; // 导出store的dispatch类型
