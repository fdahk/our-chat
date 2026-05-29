import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import mkcert from 'vite-plugin-mkcert'
import path from 'path' // 注： Vite 配置文件在 Node.js 环境下运行，依赖需安装 @types/node，确保TypeScript识别 path 模块的类型声明
// https://vite.dev/config/

const mkcertPath = path.join(
  process.env.LOCALAPPDATA || '',
  'Microsoft',
  'WinGet',
  'Packages',
  'FiloSottile.mkcert_Microsoft.Winget.Source_8wekyb3d8bbwe',
  'mkcert.exe'
)

// 用函数形式拿到 command:仅在生产构建(vite build)时移除 console/debugger,
// 开发(vite serve)时保留,不影响本地调试。
export default defineConfig(({ command }) => ({
  // esbuild 既是 Vite 的转译器也是默认压缩器,drop 会在压缩阶段静态删除这些语句
  esbuild: {
    drop: command === 'build' ? ['console', 'debugger'] : [],
  },
  plugins: [
    react(),
    mkcert({
      mkcertPath,
    }),
  ],
  server: {
    host: '0.0.0.0',
    // 开发 HTTPS：使用系统已安装的 mkcert 生成并安装本地开发 CA，浏览器与局域网设备更容易信任证书。
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3007',
        changeOrigin: true,
      },
      '/user': {
        target: 'http://127.0.0.1:3007',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://127.0.0.1:3007',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
}))
