// 注：
import { configureStore } from '@reduxjs/toolkit';
import { persistStore, persistReducer } from 'redux-persist';
import { combineReducers } from '@reduxjs/toolkit';
import storage from 'redux-persist/lib/storage';
import UserReducer from './userStore'; // 注：这里导入的是持久化包装后的 reducer
import chatReducer from './chatStore'; // 同上

const rootPersistConfig = {
  key: 'root',
  storage,
  whitelist: ['user'], // 需要持久化的 slice
};

// 合并所有reducer（每个reducer都自动管理自己的state
const rootReducer = {
  user: UserReducer,
  chat: chatReducer,
};

const persistedReducer = persistReducer(rootPersistConfig, combineReducers(rootReducer));

// 合并统一配置store，并持久化
// 推荐只能有一个store：否则
// 组件之间无法直接共享数据，全局状态被割裂，数据同步变得复杂且容易出错。
// 中间件、持久化等功能失效：redux-persist、redux-thunk、redux-saga 等中间件和工具，默认只支持单一 store。
// 多 store 时，持久化、DevTools、异步 action 等功能会变得混乱或失效。
export const rootStore = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export const rootPersistor = persistStore(rootStore); // 导出持久化的store
export type RootState = ReturnType<typeof rootStore.getState>; // 导出store的state类型
export type AppDispatch = typeof rootStore.dispatch; // 导出store的dispatch类型