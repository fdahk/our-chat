import { useDispatch, useSelector } from 'react-redux';
import { logout } from '@/store/userStore';
import { useNavigate } from 'react-router-dom';
import layoutStyle from './index.module.scss';
import { Outlet, NavLink } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import SettingView from '@/views/settingView';

function Layout() {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const user = useSelector((state: any) => state.user);
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

    // 菜单栏
    const [menuVisible, setMenuVisible] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    // 设置中心
    const [settingVisible, setSettingVisible] = useState(false);
    // 点击外部关闭
    useEffect(() => {
        if (!menuVisible) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuVisible(false);
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [menuVisible]);

    // 点击退出登录
    const handleLogout = () => {
        dispatch(logout()); // 清空用户信息
        localStorage.removeItem('token'); // 清空token  
        navigate('/login'); //注：跳转到登录页，layout组件销毁会触发useEffect，断开socket连接
    };
    // 关闭设置中心(给子组件)
    const handleCloseSetting = () => {
        setSettingVisible(false);
    }
    // 点击设置中心
    const handleSetting = () => {
        setSettingVisible(!settingVisible);
    };    
    // 点击菜单栏
    const handleMenu = () => {
        setMenuVisible(!menuVisible);
    };
    // 菜单选项
    const menuItems = [
        {
            key: 'setting',
            label: '设置',
            onClick: handleSetting,
        },
        {
            key: 'logout',
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
                        <img src={user.avatar ? `http://localhost:3007${user.avatar}` : 'src/assets/images/defaultAvatar.jpg'} alt="" />
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
                                <i className={`iconfont ${layoutStyle.my_iconfont} ${item.icon}`}></i>
                            </NavLink>
                        )
                    })
                }
                {/* 设置中心 */}
                <div className={layoutStyle.left_nav_item_menu} onClick={handleMenu}>
                    <i className={`iconfont ${layoutStyle.my_iconfont} icon-menu`}></i>
                </div>
                {/* 菜单栏 */}
                {menuVisible && (
                    <div
                        className={layoutStyle.menu_center}
                        ref={menuRef}
                    >
                        {menuItems.map(item => {
                            return (
                                <div className={layoutStyle.menu_center_item_box} key={item.key} onClick={item.onClick}>
                                    <div className={layoutStyle.menu_center_item}>
                                        {item.label}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}   
            </div>


            {/* 二级路由出口 */}
            <Outlet/>
            {/* 设置中心弹窗 */}
            {settingVisible && (
                <SettingView onClose={handleCloseSetting}/>
            )}
        </div>
    )
}

export default Layout;