// 用于创建slice 提供了 useSelector 和 useDispatch hooks，方便在 React 组件中访问 Redux 状态和派发 actions
// 默认包含了 redux-thunk，可以处理异步 action。您也可以自定义中间件
import { createSlice, type PayloadAction } from "@reduxjs/toolkit"; 
import type { User } from '@/globalType/user';
// 用户状态类型， 注：对外导出，用于数据类型检查
interface UserState extends User {
  isAuthenticated: boolean;
}

// 初始状态
const initialState: UserState = {
  id: 0,
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


// 创建 slice
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
      state.id = 0;
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
      // console.log("store更新成功");
    },
  },
});


export default userSlice.reducer; //导出用于在rootStore中合并
//废除这个store，应在rootStore中合并并统一配置
// // 配置 store
// const userStore = configureStore({
//   reducer: {
//     user: persistedUserReducer, // 使用持久化包装的 reducer
//   },
//   //  解决 serializableCheck 警告
//   // Middleware 是 Redux 中的中间件，在 action 到达 reducer前进行拦截和处理
//   // 默认包含以下 middleware：
//   // redux-thunk (处理异步 action)
//   // serializable-state-invariant-middleware (检查状态序列化)
//   // immutability-state-invariant-middleware (检查状态不可变性)
//   middleware: (getDefaultMiddleware) =>
//     getDefaultMiddleware({
//       // Redux Toolkit 默认会检查 action 和 state 是否可以被序列化

//       // 如果包含函数、Symbol 等不可序列化的值，会发出警告
//       serializableCheck: false, // 禁用序列化检查
//     }),
// });

// 创建持久化存储的 persistor 对象，用于在 React 应用中配置 PersistGate 组件
// 作用：监听 store 状态变化，自动保存到 localStorage，页面加载时恢复状态
// export const userPersistor = persistStore(userStore);


// export default userStore;
// export type RootState = ReturnType<typeof store.getState>; // 获取 store 状态类型，用于数据类型检查 export  UserState，命名麻烦不如直接导出算了
// export type UserDispatch = typeof userStore.dispatch; // dispatch 是一个hook函数，用于派发 actions
// userSlice.actions 包含所有clice的action creators，导出后可用dispatch获取action
export const { login, logout, updateProfile } = userSlice.actions; 

// 可选：导出类型
// export type { UserState };