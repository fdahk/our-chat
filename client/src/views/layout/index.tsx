import { Dropdown } from 'antd';
import { LogoutOutlined } from '@ant-design/icons';
import { useDispatch } from 'react-redux';
import { logout } from '@/store/userStore';
import { useNavigate } from 'react-router-dom';
import layoutStyle from './index.module.scss';
import { Outlet, NavLink } from 'react-router-dom';
import { clearGlobalMessages } from '@/store/chatStore';


function Layout() {
    const dispatch = useDispatch();
    const navigate = useNavigate();

    // 导航栏选项列表
    const itemList = [
        {
            name: 'chat',
            icon: 'icon-message-fill',
            path: '/chat'
        },
        {
            name: 'directory',
            icon: 'icon-user',
            path: '/directory'
        }
    ]

    // 退出登录处理
    const handleLogout = () => {
        dispatch(logout()); // 清空用户信息
        localStorage.removeItem('token'); // 清空token
        dispatch(clearGlobalMessages()); // 清空全局消息
        navigate('/login'); //注：跳转到登录页，layout组件销毁会触发useEffect，断开socket连接
    };

    const items = [
        {
            key: 'logout',
            icon: <LogoutOutlined />,
            label: '退出登录',
            onClick: handleLogout,
        },
    ];

    return (
        <div className={layoutStyle.layout_container}>
            {/* 左导航栏 */}
            <div className={layoutStyle.left_nav}>
                {/* 头像 */}
                <div className={layoutStyle.left_nav_item_avatar}>
                    <Dropdown menu={{ items }} trigger={['click']} placement="bottomRight">
                        <img src="src/assets/images/avatar.jpg" alt="" />
                    </Dropdown>
                </div>
                {/* 选项 */}
                {
                    itemList.map(item => {
                        return (
                            <NavLink 
                                key={item.name} 
                                to={item.path} 
                                className={({isActive}) => 
                                    `${layoutStyle.left_nav_item} ${isActive ? layoutStyle.active : ''}`
                                }
                            >
                                <i className={`iconfont ${layoutStyle.iconfont} ${item.icon}`}></i>
                            </NavLink>
                        )
                    })
                }
            </div>
            <Outlet/>
        </div>
    )
}

export default Layout;