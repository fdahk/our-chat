# 08 · 集成指南 · our-chat web 前端

> 给 our-chat web SPA 看的接入指南。

## 1. 你需要做的事情

1. 用 `oidc-client-ts` 库跑标准 PKCE 流(或自实现 ~ 200 行)
2. 新建 `agentHttp` axios 实例,塞 Bearer
3. 新建 OAuth callback 路由处理 code
4. 联系人列表加 "AI 助手"虚拟项,点击进入 `AgentChatPanel`

## 2. PKCE 流程关键步骤

### 2.1 启动授权

用户在 our-chat 内点击 "AI 助手" → 检查 sessionStorage 是否有有效 AT:

- **有且未过期** → 直接进 AgentChatPanel
- **没有或已过期** → 启动 PKCE 流

```ts
// utils/oauth.ts(伪代码,实际见 src/utils/oauth.ts)
async function startAuthFlow() {
  const verifier = base64UrlEncode(crypto.getRandomValues(new Uint8Array(64)));
  const challenge = base64UrlEncode(await sha256(verifier));
  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();

  sessionStorage.setItem('pkce_verifier', verifier);
  sessionStorage.setItem('pkce_state', state);
  sessionStorage.setItem('pkce_nonce', nonce);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: 'our-chat-web',
    redirect_uri: `${window.location.origin}/oauth/callback`,
    scope: 'openid profile agent-server',
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  window.location.href = `${IDP_BASE}/oauth/authorize?${params}`;
}
```

### 2.2 回调处理

```ts
// views/oauthCallback/index.tsx
async function handleCallback() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    showError(error);
    return;
  }

  // 校验 state 防 CSRF
  const expectedState = sessionStorage.getItem('pkce_state');
  if (state !== expectedState) {
    showError('state mismatch');
    return;
  }

  const verifier = sessionStorage.getItem('pkce_verifier');

  const tokenRes = await fetch(`${IDP_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${window.location.origin}/oauth/callback`,
      client_id: 'our-chat-web',
      code_verifier: verifier,
    }),
  });

  const { access_token, refresh_token, id_token, expires_in } = await tokenRes.json();

  // 校验 id_token nonce
  const idPayload = decodeJwtPayload(id_token);
  if (idPayload.nonce !== sessionStorage.getItem('pkce_nonce')) {
    showError('nonce mismatch');
    return;
  }

  // 存 token(见 §3 存储策略)
  storeTokens({ access_token, refresh_token, expires_in });

  // 清理 PKCE state
  sessionStorage.removeItem('pkce_verifier');
  sessionStorage.removeItem('pkce_state');
  sessionStorage.removeItem('pkce_nonce');

  // 跳回原意图页面
  navigate('/ai-assistant');
}
```

## 3. Token 存储策略

按 [agent-server 跨服务鉴权方案 / 方案 G §5.5](../../../../agent-server/docs/backend/跨服务鉴权方案/方案G-BFF会话.md#55-攻击者偷到-session-id-后能跨设备替代用户吗) 的分析:

| Token | 存哪 | 原因 |
|---|---|---|
| `access_token` | **sessionStorage** | 关 tab 清,短 TTL,即使被偷损失有限 |
| `refresh_token` | **sessionStorage** | 跟 AT 同等级——但要清楚这是 MVP 妥协,BFF 模式才能真正隔离 RT |
| `id_token` | sessionStorage 短暂存,展示用户信息后可清 | |

**清晰承认**:本 SPA 直持 RT 的方案是为了不上 BFF 的折中,有理论上的 XSS 风险。生产升级路径已设计(BFF 化),见架构文档。

## 4. agentHttp axios 实例

```ts
// utils/agentHttp.ts
import axios from 'axios';
import { getAccessToken, refreshAccessToken, clearTokens } from './oauth';

const agentHttp = axios.create({ baseURL: AGENT_BASE });

// 请求拦截器:塞 Authorization 头
agentHttp.interceptors.request.use(async (config) => {
  const token = await getAccessToken();    // 内部判过期,过期自动 refresh
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 响应拦截器:401 触发 refresh + 重试
let refreshing: Promise<string> | null = null;
agentHttp.interceptors.response.use(undefined, async (err) => {
  if (err.response?.status !== 401 || err.config._retry) throw err;

  err.config._retry = true;
  refreshing ??= refreshAccessToken().finally(() => { refreshing = null; });
  const newToken = await refreshing;
  if (!newToken) {
    clearTokens();
    window.location.href = '/login';
    throw err;
  }
  err.config.headers.Authorization = `Bearer ${newToken}`;
  return agentHttp(err.config);
});

export default agentHttp;
```

## 5. AgentChatPanel + 联系人虚拟项

```tsx
// views/chatView/contactList.tsx 改造:
const VIRTUAL_AI_ASSISTANT = {
  id: '__ai_assistant__',
  type: 'virtual',
  nickname: 'AI 助手',
  avatar: '/icons/ai-assistant.svg',
  pinned: true,
};

// 渲染时把这个虚拟项 unshift 到联系人列表头
const contacts = [VIRTUAL_AI_ASSISTANT, ...realContacts];

// 点击虚拟项 → 路由到 /ai-assistant(不走 socket 通道)
onClick={(c) => c.type === 'virtual' ? navigate('/ai-assistant') : openChat(c.id)}
```

## 6. SSE 流式渲染

agent-server 的对话接口是 `POST /conversations/:id/messages` 流式 SSE。前端用 `fetch + ReadableStream`,不用 EventSource(EventSource 不能塞 Authorization 头):

```ts
const res = await fetch(`${AGENT_BASE}/conversations/${convId}/messages`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${at}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query }),
});

const reader = res.body!.getReader();
const decoder = new TextDecoder();
let buf = '';
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += decoder.decode(value, { stream: true });
  const [events, rest] = parseSseFrames(buf);
  buf = rest;
  for (const ev of events) handleSseEvent(ev);
}
```

## 7. 路由改动

```ts
// router/index.tsx 增加:
{
  path: 'oauth/callback',
  lazy: lazyComponent(() => import('@/views/oauthCallback')),
},
{
  path: 'ai-assistant/*',
  lazy: lazyComponent(() => import('@/views/aiAssistant')),
},
```

注意 `ai-assistant` 路由要走 `RequireAuth`(必须 our-chat 登录态)+ 加一层 `RequireAgentAuth`(必须 OAuth token)。

## 8. 优雅降级 / 错误处理

| 场景 | 处理 |
|---|---|
| our-chat 未登录 | RequireAuth 跳 `/login` |
| our-chat 已登录但 OAuth 未授权 | RequireAgentAuth 跳 `/oauth/callback`(自动 PKCE 流) |
| OAuth 授权过期 | 自动 refresh,失败再启 PKCE 流 |
| agent-server 离线 | 5xx 显示离线提示,允许重试 |
| 用户拒绝授权(预留) | 跳回 ai-assistant 首页 + 提示 |

## 9. 开发联调

dev 环境 vite proxy 配置:

```ts
// vite.config.ts
proxy: {
  '/oauth': { target: 'http://localhost:3007', changeOrigin: true },
  '/.well-known': { target: 'http://localhost:3007', changeOrigin: true },
  '/api/agent': { target: 'http://localhost:3000', changeOrigin: true, rewrite: p => p.replace(/^\/api\/agent/, '') },
}
```

这样前端按相对路径调,生产经 nginx 同样转发。
