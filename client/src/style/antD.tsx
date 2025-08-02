// antD全局主题配置
// 注：该文件仅封装了一个主题配置组件，没有使用context机制，即不能在任意子组件里用 useContext 直接拿到 themeConfig
// 但 antd 的所有组件内部已经实现了 context 机制，只要它们在 ConfigProvider 的包裹下，就能自动获取到 theme 配置。
// 所以配置的主题会对所有被包裹的 antd 组件生效，无论嵌套多少层。只是不能自己获取数据
import { ConfigProvider } from 'antd'; //antD 提供的全局配置提供者

const themeConfig = {
    token: {
        colorPrimary: '#07c160', //UI组件主题色
        colorBgElevated: 'var(--background-color)', // 背景色
    },
};

const ThemeProvider = ({ children }: { children: React.ReactNode }) => (
    <ConfigProvider theme={themeConfig}>
        {children}
    </ConfigProvider>
);

export default ThemeProvider;