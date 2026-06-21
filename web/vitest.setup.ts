// 每个测试文件加载前执行的全局 setup。
//
// @testing-library/jest-dom 扩展 expect 的 DOM 断言(toBeInTheDocument 等),
// happy-dom 给到 document/window,无需手动 mock。
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import i18n from '@/i18n';

// 固定中文,避免 happy-dom 的 navigator.language (en-US) 让 i18n detector 切到英文,
// 测试断言里写 '用户名' 之类的中文 label 才会稳。
beforeAll(async () => { await i18n.changeLanguage('zh'); });

// 每个用例后清掉 RTL 渲染的 DOM,避免相互污染
afterEach(() => {
  cleanup();
});
