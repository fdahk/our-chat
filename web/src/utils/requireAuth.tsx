// 登录鉴权的高阶组件
import { Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '@/store/rootStore';

// token 现在走 HttpOnly cookie，前端 JS 读不到，无法在客户端判断过期。
// 因此这里只做「乐观」路由守卫：依据 redux 中的登录态决定能否进入受保护页面；
// 真正的过期与失效由后端在每次请求时校验，401 触发 http 拦截器刷新或跳转登录。
function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useSelector((state: RootState) => state.user.isAuthenticated);

  if (!isAuthenticated) {
    // replace 替换当前路由，不会留下历史记录
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export default RequireAuth;
