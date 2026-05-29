import { Suspense } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

// 开发调试中心的布局外壳。
// 整个 /debug 路由仅在开发构建中注册（见 router/index.tsx 的 import.meta.env.DEV 门控），
// 生产构建里该分支连同其动态 import 会被 tree-shaking 移除，因此这些页面不会进入产物、也不可达。
const barStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '8px 16px',
  background: '#1f1f1f',
  color: '#fff',
  fontSize: 13,
};

const badgeStyle: React.CSSProperties = {
  padding: '2px 8px',
  borderRadius: 4,
  background: '#fa8c16',
  fontWeight: 600,
  letterSpacing: 1,
};

const linkStyle: React.CSSProperties = { color: '#69b1ff', marginLeft: 'auto' };

export default function DebugLayout() {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <header style={barStyle}>
        <span style={badgeStyle}>DEV</span>
        <span>开发调试中心 · 仅开发环境可见</span>
        <NavLink to="/debug" end style={linkStyle}>
          工具列表
        </NavLink>
      </header>
      <main style={{ flex: 1, overflow: 'auto' }}>
        <Suspense fallback={<div style={{ padding: 24 }}>加载调试工具…</div>}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
