//登录鉴权的高阶组件
import { Navigate } from "react-router-dom";
import { isAuthenticated, isTokenExpiringSoon, getToken, isTokenExpired, getTokenRemainingTime} from './token';
import { useEffect, useRef, useState } from 'react';
import { message } from 'antd';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const [shouldRedirect, setShouldRedirect] = useState(false);
  // 可以用 number 替代 NodeJS.Timeout，但不是最佳实践
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // 初始检查token是否即将过期
    const token = getToken();
    if (token && isTokenExpiringSoon(token)) {
      message.warning('登录即将过期');
    }

    // 每5分钟检查一次token是否过期
    const checkTokenExpiration = () => {
      const currentToken = getToken();
      if (!currentToken || isTokenExpired(currentToken)) {
        message.error('登录已过期，请重新登录');
        // 清除定时器
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        // 重定向
        setShouldRedirect(true);
      } else if (isTokenExpiringSoon(currentToken)) {
        message.warning('登录即将过期');
      }
      console.log('token有效', getTokenRemainingTime(token || undefined));
    };

    // 立即执行一次检查
    checkTokenExpiration();

    // 设置定时器，每5分钟（300000毫秒）检查一次
    intervalRef.current = setInterval(checkTokenExpiration, 5 * 60 * 1000);

    // 清理函数：组件卸载时清除定时器
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  // 如果需要重定向或者初始认证失败，跳转到登录页
  if (shouldRedirect || !isAuthenticated()) {
    // replace 替换当前路由，不会留下历史记录
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export default RequireAuth; 