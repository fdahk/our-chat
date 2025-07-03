import layoutStyle from './index.module.scss';
import { Outlet,NavLink } from 'react-router-dom';

function Layout() {
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
    return (
        <div className={layoutStyle.layout_container}>
            {/* 左导航栏 */}
            <div className={layoutStyle.left_nav}>
                {/* 头像 */}
                <div className={layoutStyle.left_nav_item_avatar}>
                    <img src="src\assets\avatar.jpg" alt="" />
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