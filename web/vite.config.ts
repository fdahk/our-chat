import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import mkcert from 'vite-plugin-mkcert'
import path from 'path' // 注： Vite 配置文件在 Node.js 环境下运行，依赖需安装 @types/node，确保TypeScript识别 path 模块的类型声明
import fs from 'fs'
// https://vite.dev/config/

// Windows 经 WinGet 安装 mkcert 的固定路径。仅当它确实存在时才显式指定，
// 否则（macOS/Linux，或未装在该位置）交给插件自行定位/下载 mkcert，保证跨平台都能起 HTTPS dev。
const winMkcertPath = path.join(
  process.env.LOCALAPPDATA || '',
  'Microsoft',
  'WinGet',
  'Packages',
  'FiloSottile.mkcert_Microsoft.Winget.Source_8wekyb3d8bbwe',
  'mkcert.exe'
)
const mkcertOptions = fs.existsSync(winMkcertPath) ? { mkcertPath: winMkcertPath } : {}

// 用函数形式拿到 command:仅在生产构建(vite build)时移除 console/debugger,
// 开发(vite serve)时保留,不影响本地调试。
export default defineConfig(({ command }) => ({
  // esbuild 既是 Vite 的转译器也是默认压缩器,drop 会在压缩阶段静态删除这些语句
  esbuild: {
    drop: command === 'build' ? ['console', 'debugger'] : [],
  },
  plugins: [
    react(),
    mkcert(mkcertOptions),
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
  // 让每个 *.scss / *.module.scss 自动可见 tokens.scss 里的 SCSS 变量,
  // 模块文件直接写 $space-4 / $brand-wechat 即可,无需各自 @use。
  // 仅前置 @use 不会产出 CSS,所以零打包代价。
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@use "@/style/tokens.scss" as *;`,
      },
    },
  },
}))
