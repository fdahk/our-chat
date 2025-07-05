import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import './assets/iconFonts/iconfont.css' // 阿里图标
import 'antd/dist/reset.css'// Ant Design 
import './style/antD.scss' // 自定义antd样式
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
