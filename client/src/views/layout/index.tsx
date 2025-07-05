import { Dropdown, Avatar } from 'antd';
import { UserOutlined, LogoutOutlined } from '@ant-design/icons';
import { useDispatch } from 'react-redux';
import { logout } from '../../store/user';
import { useNavigate } from 'react-router-dom';
import layoutStyle from './index.module.scss';
import { Outlet, NavLink } from 'react-router-dom';
import SocketService from '../../utils/socket';
import { useEffect } from 'react';

function Layout() {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    // 渲染时连接socket
    useEffect(() => {
        const socket = SocketService.getInstance(); // 获取socket实例
        
        socket.on('connect', () => {
            console.log('socket连接成功');
        });

        return () => {
            socket.disconnect();
        };
    }, []);
    
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
        dispatch(logout());
        localStorage.removeItem('token');
        navigate('/login');
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
                        <img src="src/assets/avatar.jpg" alt="" />
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