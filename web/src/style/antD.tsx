// antD 全局主题 + locale 提供者。
// 注:
// - 主题色单一来源 ── src/style/tokens.scss 的 $brand-wechat,通过 CSS 变量
//   --color-primary 注入 :root,再读回 ConfigProvider.theme.token.colorPrimary。
// - locale 跟随 react-i18next 当前语言切换:i18n 切到 'en' 时 antd 的日期选择器
//   / Form 校验 / 上传组件等内部文案也跟着变。
import { App as AntdApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import { useLang } from '@/i18n';

const themeConfig = {
  token: {
    colorPrimary: '#07c160', // 与 tokens.scss 的 $brand-wechat 同值
    colorBgElevated: 'var(--background-color)',
  },
};

const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const { lang } = useLang();
  const antdLocale = lang === 'zh' ? zhCN : enUS;
  return (
    <ConfigProvider theme={themeConfig} locale={antdLocale}>
      <AntdApp>
        {children}
      </AntdApp>
    </ConfigProvider>
  );
};

export default ThemeProvider;
