// api.ts 单元测试。覆盖:
//   1. readSSE — 跨 chunk 分帧 / 多行 data / 坏 JSON / 多帧 / 空帧 / event 行 / id 行
//   2. token 管理 — setToken/getToken 持久化
//   3. request 401 处理 — 自动清 token 并抛 'unauthorized'
//   4. streamChat — 事件流映射(token / done / error)+ 用真实服务端 SSE 帧格式
//   5. streamRun — EventSource 包装:event 行→type,data 是整条 run_event 行
//      (业务字段在 data.payload 下,consumer 必须读 .payload —— 这是 SSE 修复的回归点)
//
// 设计原则:vi.stubGlobal('fetch', mock) 隔离网络,localStorage 走 happy-dom 真实实现。
// **所有 mock 数据均从 __fixtures__/agentServer.ts 派生**,任何契约漂移由 TS 类型层捕获。
//
// 注:token 铸造已移到 agentAuth.ensureAgentToken(由 agentAuth.test.ts 覆盖),
// api.ts 不再有 agentLogin/agentLogout。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BASE,
  createConversation,
  getToken,
  listDocuments,
  readSSE,
  setToken,
  streamChat,
  streamRun,
  type SSEFrame,
} from './api';
import type { RunEvent } from './type';
import {
  chatStreamFramesFixture,
  conversationFixture,
  runEventFixtures,
} from './__fixtures__/agentServer';

// ── 工具:把字符串拼成单/多 chunk ReadableStream ───────────────────
function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of gen) out.push(x);
  return out;
}

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

// ═══════════════════════════════════════════════════════════════════
// 1. readSSE
// ═══════════════════════════════════════════════════════════════════
describe('readSSE', () => {
  it('解析单帧 JSON,event/id 都缺省', async () => {
    const s = streamFromChunks(['data: {"a":1}\n\n']);
    expect(await collect(readSSE(s))).toEqual<SSEFrame[]>([
      { event: undefined, id: undefined, data: { a: 1 } },
    ]);
  });

  it('保留 event 与 id 字段', async () => {
    const s = streamFromChunks(['event: tool_called\nid: 42\ndata: {"x":1}\n\n']);
    expect(await collect(readSSE(s))).toEqual<SSEFrame[]>([
      { event: 'tool_called', id: '42', data: { x: 1 } },
    ]);
  });

  it('一次 chunk 含多帧', async () => {
    const s = streamFromChunks(['data: {"a":1}\n\ndata: {"a":2}\n\n']);
    const frames = await collect(readSSE(s));
    expect(frames.map((f) => f.data)).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('单帧跨多个 chunk(粘包/拆包)', async () => {
    const s = streamFromChunks(['data: {"hel', 'lo":"wor', 'ld"}\n\n']);
    const frames = await collect(readSSE(s));
    expect(frames[0]?.data).toEqual({ hello: 'world' });
  });

  it('帧分隔符 \\n\\n 跨 chunk', async () => {
    const s = streamFromChunks(['data: {"x":42}\n', '\ndata: {"x":43}\n\n']);
    const frames = await collect(readSSE(s));
    expect(frames.map((f) => f.data)).toEqual([{ x: 42 }, { x: 43 }]);
  });

  it('多行 data: 合并为单条 JSON', async () => {
    const s = streamFromChunks([
      'data: {"line":"a",\n',
      'data: "b":"c"}\n\n',
    ]);
    expect((await collect(readSSE(s)))[0]?.data).toEqual({ line: 'a', b: 'c' });
  });

  it('坏 JSON 退化为 { raw }', async () => {
    const s = streamFromChunks(['data: not-json-here\n\n']);
    expect((await collect(readSSE(s)))[0]?.data).toEqual({ raw: 'not-json-here' });
  });

  it('忽略注释行(以冒号开头),只读 data 行', async () => {
    const s = streamFromChunks([
      ': keepalive\n\n',
      'data: {"ok":true}\n\n',
    ]);
    const frames = await collect(readSSE(s));
    expect(frames).toHaveLength(1);
    expect(frames[0]?.data).toEqual({ ok: true });
  });

  it('event/id 行存在但 data 缺失时,整帧丢弃', async () => {
    const s = streamFromChunks(['event: foo\nid: 1\n\n', 'data: {"v":1}\n\n']);
    const frames = await collect(readSSE(s));
    expect(frames).toHaveLength(1);
    expect(frames[0]?.event).toBeUndefined();
  });

  it('空流不抛错', async () => {
    expect(await collect(readSSE(streamFromChunks([])))).toEqual([]);
  });

  it('结尾没 \\n\\n 的尾巴被丢弃', async () => {
    const s = streamFromChunks(['data: {"a":1}\n\ndata: {"b":2}']);
    const frames = await collect(readSSE(s));
    expect(frames).toHaveLength(1);
    expect(frames[0]?.data).toEqual({ a: 1 });
  });

  it('真实 agent-server token 帧解析', async () => {
    const s = streamFromChunks([chatStreamFramesFixture.token]);
    const frames = await collect(readSSE(s));
    expect(frames[0]).toEqual({
      event: 'token',
      id: undefined,
      data: { type: 'token', value: 'hello' },
    });
  });

  it('真实 agent-server error 帧:event=error,data 不含 type', async () => {
    const s = streamFromChunks([chatStreamFramesFixture.error]);
    const frames = await collect(readSSE(s));
    expect(frames[0]).toEqual({
      event: 'error',
      id: undefined,
      data: { message: 'oops' },
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. token 管理
// ═══════════════════════════════════════════════════════════════════
describe('token storage', () => {
  it('setToken 写入,getToken 读回', () => {
    expect(getToken()).toBeNull();
    setToken('abc123');
    expect(getToken()).toBe('abc123');
  });

  it('setToken(null) 清除', () => {
    setToken('x');
    setToken(null);
    expect(getToken()).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. request 401 / 鉴权 / 头部
// ═══════════════════════════════════════════════════════════════════
describe('request()', () => {
  beforeEach(() => { setToken('TEST_TOKEN'); });

  it('GET 自动加 Authorization Bearer', async () => {
    const mock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', mock);

    await listDocuments();

    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0];
    expect(url).toBe(`${BASE}/documents`);
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer TEST_TOKEN');
  });

  it('POST JSON 自动加 Content-Type + Bearer', async () => {
    // 注意:用 fixture 派生 mock 响应。服务端契约改了 → fixture 改 → 测试自动联动。
    const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify(conversationFixture), { status: 200 }));
    vi.stubGlobal('fetch', mock);

    await createConversation('新对话');

    const init = mock.mock.calls[0][1];
    expect((init.headers as Headers).get('Content-Type')).toBe('application/json');
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer TEST_TOKEN');
    expect(init.method).toBe('POST');
  });

  it('401 清 token 并抛 unauthorized', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
    await expect(listDocuments()).rejects.toThrow('unauthorized');
    expect(getToken()).toBeNull();
  });

  it('非 2xx 非 401 抛带状态码的错', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 500 })));
    await expect(listDocuments()).rejects.toThrow(/HTTP 500.*boom/);
    expect(getToken()).toBe('TEST_TOKEN');
  });

  it('204 返回 undefined,不解析 body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const { deleteDocument } = await import('./api');
    await expect(deleteDocument(1)).resolves.toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. streamChat 事件流(用真实服务端帧格式)
// ═══════════════════════════════════════════════════════════════════
describe('streamChat()', () => {
  beforeEach(() => setToken('T'));

  it('依序 yield token → done(用真实 event: 行格式)', async () => {
    const body = streamFromChunks([
      chatStreamFramesFixture.token,
      chatStreamFramesFixture.done,
    ]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })));

    const out = [];
    for await (const e of streamChat(1, 'q')) out.push(e);

    expect(out).toEqual([
      { type: 'token', value: 'hello' },
      { type: 'done', messageId: 42, citations: [] },
    ]);
  });

  it('event: error 帧:data 只有 { message },streamChat 必须补 type:error', async () => {
    // 这是 bug 重灾区 ── 服务端的 error 帧 data 里没有 type,
    // 必须靠 event: 行还原。早期版本没读 event 行 → UI error 处理静默失效。
    const body = streamFromChunks([chatStreamFramesFixture.error]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })));

    const out = [];
    for await (const e of streamChat(1, 'q')) out.push(e);
    expect(out).toEqual([{ type: 'error', message: 'oops' }]);
  });

  it('SSE 流上的 401 清 token + 抛 unauthorized', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    const iter = streamChat(1, 'q');
    await expect(iter.next()).rejects.toThrow('unauthorized');
    expect(getToken()).toBeNull();
  });

  it('body 为空时抛错', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    const iter = streamChat(1, 'q');
    await expect(iter.next()).rejects.toThrow(/chat stream 500/);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. streamRun（EventSource）
// ═══════════════════════════════════════════════════════════════════
// streamRun 用 EventSource(非 fetch),happy-dom 不一定实现,显式桩掉以可控地推帧。
class FakeEventSource {
  static last: FakeEventSource | null = null;
  url: string;
  closed = false;
  onerror: ((e: Event) => void) | null = null;
  private listeners: Record<string, Array<(e: MessageEvent) => void>> = {};
  constructor(url: string) {
    this.url = url;
    FakeEventSource.last = this;
  }
  addEventListener(type: string, cb: (e: MessageEvent) => void): void {
    (this.listeners[type] ??= []).push(cb);
  }
  close(): void {
    this.closed = true;
  }
  // 测试辅助:模拟服务端推一帧(type=event 行,data=data: 行原文)
  push(type: string, data: string, lastEventId = ''): void {
    const e = { data, lastEventId } as MessageEvent;
    (this.listeners[type] ?? []).forEach((cb) => cb(e));
  }
}

describe('streamRun()', () => {
  it('event 行映射为 type;data 是整条 run_event 行(答案在 data.payload.content)', () => {
    vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource);
    const got: RunEvent[] = [];
    const close = streamRun('run-1', (e) => got.push(e));

    const es = FakeEventSource.last!;
    // 真实 wire:data: 行是整条 run_event 行的 JSON,payload 嵌在其下
    es.push('final_answer', JSON.stringify(runEventFixtures.finalAnswer.data), '4');

    expect(got).toHaveLength(1);
    expect(got[0].type).toBe('final_answer');
    expect(got[0].id).toBe('4');
    // 回归点:答案在 data.payload.content,不是 data.content
    expect((got[0].data?.payload as { content: string }).content).toBe('done summary');

    close();
    expect(es.closed).toBe(true);
  });

  it('tool_called / tool_result 帧:payload 下含 name / args / result', () => {
    vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource);
    const got: RunEvent[] = [];
    streamRun('run-2', (e) => got.push(e));
    const es = FakeEventSource.last!;

    es.push('tool_called', JSON.stringify(runEventFixtures.toolCalled.data), '2');
    es.push('tool_result', JSON.stringify(runEventFixtures.toolResult.data), '3');

    expect(got.map((e) => e.type)).toEqual(['tool_called', 'tool_result']);
    expect((got[0].data?.payload as { name: string }).name).toBe('retrieve_knowledge');
    expect((got[1].data?.payload as { result: string }).result).toBe('hits: 3 chunks');
  });

  it('坏 JSON 帧被跳过,不抛', () => {
    vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource);
    const got: RunEvent[] = [];
    streamRun('run-3', (e) => got.push(e));
    expect(() => FakeEventSource.last!.push('tool_called', 'not-json')).not.toThrow();
    expect(got).toHaveLength(0);
  });

  it('带 token 时把 access_token 拼进 stream URL', () => {
    setToken('TT');
    vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource);
    streamRun('run-9', () => {});
    expect(FakeEventSource.last!.url).toContain(`${BASE}/runs/run-9/stream`);
    expect(FakeEventSource.last!.url).toContain('access_token=TT');
  });
});
