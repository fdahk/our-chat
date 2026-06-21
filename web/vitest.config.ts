/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

// 独立的 vitest 配置(不跟 vite.config.ts 合一),理由:
//  - vite.config.ts 含 mkcert / HTTPS dev / proxy 等 dev server 配置,与测试无关
//  - vitest 跑测试时不需要 React Refresh runtime,plugin 配置更窄
//  - 后续可独立调 test pool / coverage 阈值,不污染 dev/build 配置
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // SCSS 模块在测试中按字符串注入(不渲染样式),tokens.scss 自动注入也保留,
  // 让 import.module.scss 不会因 SCSS 编译失败而中断 test。
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@use "@/style/tokens.scss" as *;`,
      },
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',  // happy-dom 比 jsdom 快约 3-4×,API 覆盖足够前端 unit/component
    setupFiles: ['./vitest.setup.ts'],
    css: false,                 // 不进 CSS Module 哈希流程,组件测试只验结构与行为
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/views/agentView/**/*.{ts,tsx}'],
      exclude: ['**/*.test.*', '**/style.module.scss', '**/type.ts'],
    },
  },
});
