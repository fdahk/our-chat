// 首方(BFF)令牌获取:用 our-chat 自身的已登录会话(HttpOnly cookie + CSRF 双提交)
// 调 our-chat 服务端的 POST /oauth/agent-token,换出一枚 agent-server-scoped 的
// RS256 access_token。免去 agent-server 独立账号登录,也免去 OAuth 重定向往返。
//
// 换出的 token 写进 api.ts 共享的 token 槽(setToken),streamChat / request 直接复用。
// 端点挂在 our-chat 服务端根路径 /oauth(不在 /api 下),故走 SERVER_ORIGIN 而非 BASE。

import { SERVER_ORIGIN } from '@/utils/runtime';
import { getToken, setToken } from './api';

const CSRF_COOKIE = 'csrfToken';
// access_token 过期前的提前量:留 30s 余量,避免边界上拿到刚好失效的 token。
const EXPIRY_SKEW_MS = 30_000;

interface AgentTokenResp {
  access_token: string;
  token_type: string;
  expires_in: number;
}

// 当前 token 的失效时刻(epoch ms)。token 本体存在 localStorage(api.ts 的 TOKEN_KEY),
// 但失效时刻不进 JWT 解析(避免引依赖),用内存记一份;页面刷新后内存丢失会触发一次重铸,可接受。
let expiresAtMs = 0;
// 并发去重:多个调用同时 ensure 时共享同一个铸造 in-flight,避免打多次 /oauth/agent-token。
let inflight: Promise<string> | null = null;

function readCsrfCookie(): string {
  const match = document.cookie.match(
    new RegExp('(?:^|; )' + CSRF_COOKIE + '=([^;]*)'),
  );
  return match ? decodeURIComponent(match[1]) : '';
}

async function mint(): Promise<string> {
  const res = await fetch(`${SERVER_ORIGIN}/oauth/agent-token`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRF-Token': readCsrfCookie() },
  });
  if (!res.ok) {
    // 铸造失败:清掉可能已失效的旧 token,让上层引导回 our-chat 登录。
    setToken(null);
    expiresAtMs = 0;
    throw new Error(`agent-token mint failed: ${res.status}`);
  }
  const data = (await res.json()) as AgentTokenResp;
  if (!data.access_token || typeof data.expires_in !== 'number') {
    setToken(null);
    expiresAtMs = 0;
    throw new Error('agent-token mint: malformed response');
  }
  setToken(data.access_token);
  expiresAtMs = Date.now() + data.expires_in * 1000;
  return data.access_token;
}

// 返回一枚有效的 agent-server access_token:命中未过期的缓存直接返回,否则铸造一枚。
export async function ensureAgentToken(): Promise<string> {
  const cached = getToken();
  if (cached && Date.now() < expiresAtMs - EXPIRY_SKEW_MS) {
    return cached;
  }
  if (inflight) return inflight;
  inflight = mint().finally(() => {
    inflight = null;
  });
  return inflight;
}

// 强制重铸(忽略缓存):401 之后想立刻拿一枚新 token 时用。
export async function refreshAgentToken(): Promise<string> {
  expiresAtMs = 0;
  return ensureAgentToken();
}
