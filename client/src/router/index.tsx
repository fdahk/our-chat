import { createBrowserRouter, Navigate } from "react-router-dom"; 
import ChatView from "../views/chatView/index.tsx";
import Layout from "../views/layout/index.tsx";
import DirectoryView from "../views/directoryView/index.tsx";
import LoginView from "../views/loginView/index.tsx";
import RegisterView from "../views/registerView/index.tsx";
const router = createBrowserRouter([
    // 一级路由首页
    {
        path: "",
        element: <Layout/>,
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
                // 三级路由
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
    }
]);

export default router;