// 全局 i18n 入口。由 main.tsx 单次 import 即生效。
//
// 设计要点:
//   - react-i18next 用单例 i18n 实例,不需要 <I18nextProvider>(虽然提供了,但
//     默认导出的实例已自动注入 React Context 给 useTranslation)
//   - 翻译资源放 src/locales/{zh,en}.ts,英文文件用 LocaleZh 类型约束 schema
//     一致,任何 key 缺漏都会编译期报错
//   - 持久化走 LanguageDetector 的 localStorage 适配器(key: i18nextLng)
//   - 暴露 useLang() 给上层组件做"中/EN 切换按钮"等 UI;它在 useTranslation
//     基础上做了归一化:i18n 内部允许 'zh-CN' / 'zh-Hant',我们对外只暴露
//     'zh' / 'en' 两态

import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next, useTranslation } from 'react-i18next';
import zh from '@/locales/zh';
import en from '@/locales/en';

export type AppLang = 'zh' | 'en';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      zh: { translation: zh },
      en: { translation: en },
    },
    fallbackLng: 'zh',
    supportedLngs: ['zh', 'en'],
    nonExplicitSupportedLngs: true, // 'zh-CN' / 'zh-Hant' 都走 'zh'
    interpolation: { escapeValue: false }, // React 自带 XSS 防护
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
    returnNull: false,
  });

// 同步 <html lang> 属性,利于 SEO 与无障碍
i18n.on('languageChanged', (lng) => {
  document.documentElement.setAttribute(
    'lang',
    lng.startsWith('zh') ? 'zh-CN' : 'en',
  );
});

export default i18n;

// ── 组件侧使用便捷 hook ─────────────────────────────────────────────────────
//
// 用法:
//   const { t, lang, setLang, toggle } = useLang();
//   t('auth.login.title')
//   <button onClick={toggle}>{lang === 'zh' ? 'EN' : '中'}</button>
//
// 注意:i18n.language 可能是 'zh-CN',我们对外归一化为 'zh' / 'en' 两态。
export function useLang() {
  const { t, i18n } = useTranslation();
  const lang: AppLang = i18n.language?.startsWith('zh') ? 'zh' : 'en';

  return {
    t,
    lang,
    setLang: (l: AppLang) => i18n.changeLanguage(l),
    toggle: () => i18n.changeLanguage(lang === 'zh' ? 'en' : 'zh'),
  };
}
