import settingStyle from './index.module.scss';
import { Outlet } from 'react-router-dom';
function SettingView() {
    const items = [
        {
            key: 'account',
            label: '账号设置',
        },
        {
            key: 'general',
            label: '通用设置',
        }
    ]
    return (
        <div className={settingStyle.setting_view_mask}>
        <div className={settingStyle.setting_view}>
            <div className={settingStyle.setting_view_title}>
                <h1>设置</h1>
            </div>
            {/* 左侧选项 */}
            <div className={settingStyle.setting_view_left}>
                {items.map(item => {
                    return (
                        <div className={settingStyle.setting_view_left_item} key={item.key}>
                            {item.label}
                        </div>
                    )
                })}
            </div>
            {/* 右侧内容 */}
            <div className={settingStyle.setting_view_right}>
                <Outlet />
            </div>
        </div>
        </div>
    )
}
export default SettingView;