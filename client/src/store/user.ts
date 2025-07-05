import { configureStore, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import storage from 'redux-persist/lib/storage'; // 默认使用 localStorage
import { persistReducer, persistStore } from 'redux-persist';

// 用户状态类型
interface UserState {
  id: number | null;
  username: string;
  nickname: string;
  email: string;
  avatar: string;
  bio: string;
  phone: string;
  status: string;
  created_at: string;
  updated_at: string;
  last_seen: string;
  isAuthenticated: boolean;
}

// 初始状态
const initialState: UserState = {
  id: null,
  username: '',
  nickname: '',
  email: '',
  avatar: '',
  bio: '',
  phone: '',
  status: '',
  created_at: '',
  updated_at: '',
  last_seen: '',
  isAuthenticated: false,
};

// 1. 配置 persist
const persistConfig = {
  key: 'user',      // 存储在 localStorage 的 key
  storage,          // 存储方式
  whitelist: ['id', 'username', 'nickname', 'email', 'avatar', 'bio', 'phone', 'status', 'created_at', 'updated_at', 'last_seen', 'isAuthenticated'] // 只持久化这些字段
};

// 2. 创建 slice
const userSlice = createSlice({
  name: 'user', //为这个 slice 命名，用于生成 action 类型前缀
  initialState, //初始状态
  reducers: {
    login: (state, action: PayloadAction<Omit<UserState, 'isAuthenticated'>>) => {
      // 登录 action
      state.id = action.payload.id;
      state.username = action.payload.username;
      state.nickname = action.payload.nickname;
      state.email = action.payload.email;
      state.avatar = action.payload.avatar;
      state.bio = action.payload.bio;
      state.phone = action.payload.phone;
      state.status = action.payload.status;
      state.created_at = action.payload.created_at;
      state.updated_at = action.payload.updated_at;
      state.last_seen = action.payload.last_seen;
      state.isAuthenticated = true;
      console.log("store储存成功");
    },
    logout: (state) => {
      // 退出登录 action
      state.id = null;
      state.username = '';
      state.nickname = '';
      state.email = '';
      state.avatar = '';
      state.bio = '';
      state.phone = '';
      state.status = '';
      state.created_at = '';
      state.updated_at = '';
      state.last_seen = '';
      state.isAuthenticated = false;
      console.log("store清空成功");
    },
    // partial 全部可选实现部分更新
    updateProfile: (state, action: PayloadAction<Partial<UserState>>) => {
      // 更新用户信息 action
      Object.assign(state, action.payload);
      console.log("store更新成功");
    },
  },
});

// 3. 包装 reducer
const persistedUserReducer = persistReducer(persistConfig, userSlice.reducer);

// 配置 store
const store = configureStore({
  reducer: {
    user: persistedUserReducer,
  },
  // 5. 解决 serializableCheck 警告
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export const persistor = persistStore(store);
export default store;

export type RootState = ReturnType<typeof store.getState>; // 获取 store 状态类型，用于数据类型检查
export type AppDispatch = typeof store.dispatch; // dispatch 是一个hook函数，用于派发 actions

export const { login, logout, updateProfile } = userSlice.actions;