import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './assets/iconFonts/iconfont.css' // 阿里图标
// 注意这个的引入必须在阿里图标后面，确保APP内所有对iconfont属性的修改能覆盖默认值，而不是被覆盖导致失效
import App from './App.tsx' 
import 'antd/dist/reset.css'// Ant Design 
import './style/antD.scss' // 自定义antd样式
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
