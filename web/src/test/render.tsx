// 测试用渲染助手。把组件包进 i18n + ToastProvider,模拟真实组件树。
//
// 注:i18n 通过 '@/i18n' 的 side-effect 初始化(挂上 i18next 单例)。组件里
// useLang() 会拿到中文(默认)。需要切英文可用 i18n.changeLanguage('en')。
/* eslint-disable react-refresh/only-export-components */
// 测试工具文件,故 disable react-refresh 规则。
// 不参与 HMR(测试用)而且要 re-export RTL 的所有命名导出供测试方便引用。
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import '@/i18n';
import { ToastProvider } from '@/globalComponents/toast';

function Wrap({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

export function renderWithProviders(
  ui: ReactElement,
  opts?: Omit<RenderOptions, 'wrapper'>,
): RenderResult {
  return render(ui, { wrapper: Wrap, ...opts });
}

export * from '@testing-library/react';
