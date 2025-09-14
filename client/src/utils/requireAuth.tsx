//登录鉴权的高阶组件
import { Navigate } from "react-router-dom";
import { isAuthenticated, isTokenExpiringSoon, getToken } from './token';
import { useEffect } from 'react';
import { message } from 'antd';

function RequireAuth({ children }: { children: React.ReactNode }) {
  // const token = localStorage.getItem('token');
  // return token ? children : <Navigate to="/login" replace />;
  useEffect(() => {
    // 检查token是否即将过期，给用户提示
    const token = getToken();
    if (token && isTokenExpiringSoon(token)) {
      message.warning('您的登录即将过期，请注意保存数据');
    }
  }, []);

  // 使用更严格的认证检查
  if (!isAuthenticated()) {
    // replace 替换当前路由，不会留下历史记录
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export default RequireAuth; 