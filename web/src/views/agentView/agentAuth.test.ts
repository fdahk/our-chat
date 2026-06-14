// agentAuth.ts 单元测试。覆盖:
//   1. ensureAgentToken — 无 token 时铸造、命中缓存不重铸、并发去重
//   2. mint 失败 → 清 token 并抛错
//   3. refreshAgentToken — 忽略缓存强制重铸
//   4. 请求形态 — POST /oauth/agent-token,credentials:include,带 X-CSRF-Token
//
// 模块级状态(expiresAtMs / inflight)跨用例残留,故每个用例用 vi.resetModules()
// + 动态 import 拿到干净的模块实例。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function loadModule() {
  vi.resetModules();
  const auth = await import('./agentAuth');
  const api = await import('./api');
  return { auth, api };
}

function okResp(access_token = 'AT_1', expires_in = 900) {
  return new Response(
    JSON.stringify({ access_token, token_type: 'Bearer', expires_in }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

beforeEach(() => {
  localStorage.clear();
  document.cookie = 'csrfToken=csrf-xyz';
});

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  document.cookie = 'csrfToken=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

describe('ensureAgentToken()', () => {
  it('无缓存时铸造:POST /oauth/agent-token,带 credentials 与 CSRF 头', async () => {
    const { auth, api } = await loadModule();
    const mock = vi.fn().mockResolvedValue(okResp('AT_NEW'));
    vi.stubGlobal('fetch', mock);

    const token = await auth.ensureAgentToken();

    expect(token).toBe('AT_NEW');
    expect(api.getToken()).toBe('AT_NEW');
    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0];
    expect(String(url)).toMatch(/\/oauth\/agent-token$/);
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-xyz');
  });

  it('缓存未过期时直接返回,不再打网络', async () => {
    const { auth } = await loadModule();
    const mock = vi.fn().mockResolvedValue(okResp('AT_CACHED', 900));
    vi.stubGlobal('fetch', mock);

    const first = await auth.ensureAgentToken();
    const second = await auth.ensureAgentToken();

    expect(first).toBe('AT_CACHED');
    expect(second).toBe('AT_CACHED');
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('并发调用去重为单次铸造', async () => {
    const { auth } = await loadModule();
    const mock = vi.fn().mockResolvedValue(okResp('AT_CONCUR'));
    vi.stubGlobal('fetch', mock);

    const [a, b] = await Promise.all([
      auth.ensureAgentToken(),
      auth.ensureAgentToken(),
    ]);

    expect(a).toBe('AT_CONCUR');
    expect(b).toBe('AT_CONCUR');
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('铸造失败(401)→ 清 token 并抛错', async () => {
    const { auth, api } = await loadModule();
    api.setToken('STALE');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));

    await expect(auth.ensureAgentToken()).rejects.toThrow(/mint failed: 401/);
    expect(api.getToken()).toBeNull();
  });

  it('响应缺 access_token → 抛错并清 token', async () => {
    const { auth, api } = await loadModule();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ token_type: 'Bearer', expires_in: 900 }), { status: 200 }),
      ),
    );
    await expect(auth.ensureAgentToken()).rejects.toThrow(/malformed/);
    expect(api.getToken()).toBeNull();
  });
});

describe('refreshAgentToken()', () => {
  it('忽略未过期缓存,强制重铸一枚新 token', async () => {
    const { auth, api } = await loadModule();
    const mock = vi
      .fn()
      .mockResolvedValueOnce(okResp('AT_OLD'))
      .mockResolvedValueOnce(okResp('AT_FRESH'));
    vi.stubGlobal('fetch', mock);

    await auth.ensureAgentToken();
    const refreshed = await auth.refreshAgentToken();

    expect(refreshed).toBe('AT_FRESH');
    expect(api.getToken()).toBe('AT_FRESH');
    expect(mock).toHaveBeenCalledTimes(2);
  });
});
