import { configureStore, createSlice, type PayloadAction } from "@reduxjs/toolkit";

// 用户状态类型
interface UserState {
  id: string | null;
  name: string;
  email: string;
  avatar: string;
  isAuthenticated: boolean;
}

// 初始状态
const initialState: UserState = {
  id: null,
  name: '',
  email: '',
  avatar: '',
  isAuthenticated: false,
};

// 创建用户 slice
// createSlice：自动生成 action creators 和 reducer 的工具函数
const userSlice = createSlice({
  name: 'user', //为这个 slice 命名，用于生成 action 类型前缀
  initialState, //初始状态
  reducers: {
    login: (state, action: PayloadAction<Omit<UserState, 'isAuthenticated'>>) => {
      // 登录 action
      state.id = action.payload.id;
      state.name = action.payload.name;
      state.email = action.payload.email;
      state.avatar = action.payload.avatar;
      state.isAuthenticated = true;
    },
    logout: (state) => {
      // 退出登录 action
      state.id = null;
      state.name = '';
      state.email = '';
      state.avatar = '';
      state.isAuthenticated = false;
    },
    // partial 全部可选实现部分更新
    updateProfile: (state, action: PayloadAction<Partial<UserState>>) => {
      // 更新用户信息 action
      Object.assign(state, action.payload);
    },
  },
});

// 导出 actions
export const { login, logout, updateProfile } = userSlice.actions;

// 配置 store
const store = configureStore({
  reducer: {
    user: userSlice.reducer,
  },
});


export type RootState = ReturnType<typeof store.getState>; // 获取 store 的根状态类型，用于数据类型检查
export type AppDispatch = typeof store.dispatch; // dispatch 是一个函数，用于派发 actions

export default store;