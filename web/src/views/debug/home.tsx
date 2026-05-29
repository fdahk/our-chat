import { Link } from 'react-router-dom';
import { debugTools } from './tools';

// 调试中心首页：列出当前可用的调试工具。
export default function DebugHome() {
  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginTop: 0 }}>调试工具</h2>
      <p style={{ color: '#888' }}>
        以下页面仅在开发构建（<code>import.meta.env.DEV</code>）中注册，生产构建会被整体移除，不进入产物、不可达。
      </p>
      <ul style={{ lineHeight: 2 }}>
        {debugTools.map((tool) => (
          <li key={tool.path}>
            <Link to={tool.path}>{tool.title}</Link>
            <span style={{ color: '#888' }}> — {tool.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
