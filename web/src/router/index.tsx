import { createBrowserRouter, Navigate } from "react-router-dom";
import type { ComponentType } from "react";
// 一级路由组件
import Layout from "@/views/layout/index.tsx";
import LoginView from "@/views/loginView/index.tsx";
import RegisterView from "@/views/registerView/index.tsx";
// 二级路由组件
import DirectoryView from "@/views/directoryView/index.tsx";
import ChatView from "@/views/chatView/index.tsx";
// 三级路由组件
import RequireAuth from "@/utils/requireAuth";

// 把动态 import 的模块默认导出包装成 React Router 的 lazy 路由模块
const lazyComponent =
    (loader: () => Promise<{ default: ComponentType }>) =>
    async () => ({ Component: (await loader()).default });

// 开发调试中心：仅在开发构建中注册。
// import.meta.env.DEV 在生产构建会被替换为字面量 false，整个分支连同其动态 import
// 都会被 Rollup tree-shaking 移除——调试页根本不会进入生产产物，也就不可达。
// 这比「运行时鉴权」更强：前端运行时检查可被绕过，而这里的代码压根没被发布。
const devOnlyRoutes = import.meta.env.DEV
    ? [
          {
              path: "debug",
              lazy: lazyComponent(() => import("@/views/debug")),
              children: [
                  {
                      index: true,
                      lazy: lazyComponent(() => import("@/views/debug/home")),
                  },
                  {
                      path: "upload",
                      lazy: lazyComponent(() => import("@/views/debug/uploadDemo")),
                  },
              ],
          },
      ]
    : [];

const router = createBrowserRouter([
    // 一级路由首页
    {
        path: "",
        element: (
            // 加载页面时鉴定一次
            <RequireAuth>
                <Layout/>
            </RequireAuth>
        ),
        // redirect: "/chat", //React Router v6 没有 redirect 属性
        // 二级路由
        children: [
            { //默认重定向
                index: true,
                element: <Navigate to="/chat" replace/>
            },
            {
                path: "chat",
                element: <ChatView/>,
            },
            {
                path: "directory",
                element: <DirectoryView/>,
            }
        ]
    },
    // 一级路由登录
    {
        path: "login",
        element: <LoginView/>,
    },
    // 一级路由注册
    {
        path: "register",
        element: <RegisterView/>,
    },
    // 开发调试路由（生产构建中为空数组，被静态消除）
    ...devOnlyRoutes
]);

export default router;