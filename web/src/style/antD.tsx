// antD 全局配置 + locale 提供者。明暗算法跟随全局主题(useTheme),locale 跟随 i18n。
import { App as AntdApp, ConfigProvider, theme as antdTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import { useLang } from '@/i18n';
import { useTheme } from './theme';

const AntdProvider = ({ children }: { children: React.ReactNode }) => {
  const { lang } = useLang();
  const { resolved } = useTheme();
  const antdLocale = lang === 'zh' ? zhCN : enUS;

  const themeConfig = {
    algorithm: resolved === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: '#07c160',
      colorBgElevated: 'var(--popover-bg)',
    },
  };

  return (
    <ConfigProvider theme={themeConfig} locale={antdLocale}>
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  );
};

export default AntdProvider;
