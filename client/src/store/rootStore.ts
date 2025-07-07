import { configureStore } from '@reduxjs/toolkit';
import { persistStore, persistReducer } from 'redux-persist';
import { combineReducers } from '@reduxjs/toolkit';
import storage from 'redux-persist/lib/storage';

import userReducer from './userStore'; // 注：这里导入的是持久化包装后的 reducer
import chatReducer from './chatStore'; // 同上

const rootPersistConfig = {
  key: 'root',
  storage,
  whitelist: ['user', 'chat'], // 需要持久化的 slice
};

// 合并所有reducer（每个reducer都自动管理自己的state
const rootReducer = {
  user: userReducer,
  chat: chatReducer,
};

const persistedReducer = persistReducer(rootPersistConfig, combineReducers(rootReducer));

// 配置store
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