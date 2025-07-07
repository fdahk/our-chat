import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path' // 注： Vite 配置文件在 Node.js 环境下运行，依赖需安装 @types/node，确保TypeScript识别 path 模块的类型声明
// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
