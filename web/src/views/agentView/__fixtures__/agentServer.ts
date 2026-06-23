// agent-server 真实响应样本(契约层 fixture)。
//
// 为什么要这层?
//   过去一版我自己脑补 DTO 形状,跑 47 个测试全过,但实际接服务时 5 处契约对不上
//   (token 字段名、document 字段、SSE event 行、displayName 必填、run id 类型)。
//   测试是在自我证明,没有跟服务端契约对齐。
//
// 现在的约定:
//   - 这里的每个常量都是"从真实 agent-server 复制粘贴过来"的样本
//     ── 跑一遍服务,curl 接口,记下原样回来的 JSON
//   - 所有测试的 mock 数据从这里 import,**不允许在测试文件里 inline 自造**
//   - TS 类型用 satisfies 校验:服务契约改了 → 类型对不上 → 编译挂 → 立即发现
//   - 服务端改字段名 → 这里改一处 → 全测试套联动失败 → 立即修
//
// 这是"消费侧契约测试"的轻量等价物。重量版是 Pact / msw + OpenAPI,留作未来 phase。

import type {
  AgentConversation,
  AgentDocument,
  AgentMessage,
  AgentTaskResp,
  AgentUser,
  RunEvent,
} from '../type';

// ── GET /auth/me 响应 ──────────────────────────────────────────────
export const authMeFixture = {
  id: 1,
  username: 'alice',
  displayName: 'Alice',
  roleCode: 'user',
} satisfies AgentUser;

// ── GET /documents 列表项 ─────────────────────────────────────────
// 来源:agent-server/apps/node-server/prisma/schema.prisma 的 Document model
//   字段名注意:sizeBytes(@map size_bytes)、errorMsg(@map error_msg)
export const documentReadyFixture = {
  id: 7,
  filename: 'spec.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 12_345,
  status: 'ready',
  chunkCount: 8,
  errorMsg: null,
  createdAt: '2026-06-07T12:00:00.000Z',
  updatedAt: '2026-06-07T12:00:00.000Z',
} satisfies AgentDocument;

export const documentParsingFixture = {
  ...documentReadyFixture,
  id: 8,
  filename: 'in-progress.md',
  status: 'parsing',
  chunkCount: 0,
} satisfies AgentDocument;

export const documentFailedFixture = {
  ...documentReadyFixture,
  id: 9,
  filename: 'busted.docx',
  status: 'failed',
  errorMsg: '解析器抛了 UnsupportedEncodingException',
  chunkCount: 0,
} satisfies AgentDocument;

// ── POST /documents 上传响应 ──────────────────────────────────────
export const uploadDocRespFixture = {
  documentId: 7,
  runId: '0a1b2c3d-4e5f-6789-abcd-ef0123456789',
};

// ── GET /conversations 与 /conversations/:id ─────────────────────
export const conversationFixture = {
  id: 1,
  title: '聊天 1',
  createdAt: '2026-06-07T12:00:00.000Z',
  updatedAt: '2026-06-07T12:00:00.000Z',
} satisfies AgentConversation;

export const userMsgFixture = {
  id: 100,
  conversationId: 1,
  role: 'user',
  content: 'hello',
  createdAt: '2026-06-07T12:00:00.000Z',
} satisfies AgentMessage;

export const assistantMsgFixture = {
  id: 101,
  conversationId: 1,
  role: 'assistant',
  content: 'hi back',
  citations: [{ chunkId: 1, documentId: 7, score: 0.92, filename: 'spec.pdf' }],
  createdAt: '2026-06-07T12:00:01.000Z',
} satisfies AgentMessage;

// ── POST /conversations/:id/messages SSE 帧 ──────────────────────
// 来源:agent-server/apps/node-server/src/modules/conversations/conversations.controller.ts:85
//   res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
// → 也就是说每一帧都同时含 event: 行和 data: 行,data 里是完整 ChatStreamEvent 对象。
// 错误帧例外:event: error\ndata: { message: "..." }(data 里**没有** type 字段)
export const chatStreamFramesFixture = {
  token: 'event: token\ndata: {"type":"token","value":"hello"}\n\n',
  done: 'event: done\ndata: {"type":"done","messageId":42,"citations":[]}\n\n',
  // 注意:error 的 data 没有 type 字段,UI 必须靠 event: 行还原
  error: 'event: error\ndata: {"message":"oops"}\n\n',
};

// ── POST /agent/tasks 响应 ───────────────────────────────────────
export const agentTaskRespFixture = {
  runId: '0a1b2c3d-4e5f-6789-abcd-ef0123456789',
} satisfies AgentTaskResp;

// ── GET /runs/:runId/stream RunEvent 样本 ───────────────────────
// agent-server 用 @Sse() 发 MessageEvent { id: String(sequenceNo), type, data },
// id 是 string ── 注意不要 Number(),非纯数字 sequenceNo 会被吞成 0。
// 注意:runs SSE 的 data 是整条 run_event 行(runs.controller.ts: `data: ev`),
// 即 { id, runId, sequenceNo, eventType, payload, createdAt };真正的业务字段在 payload 下。
//   tool_called.payload = { name, args }、tool_result.payload = { name, result }、
//   final_answer.payload = { content }(对齐 agent-runner.service.ts 的 emit)。
export const runEventFixtures = {
  toolCalled: {
    id: '1',
    type: 'tool_called',
    data: {
      id: 1, runId: 'r1', sequenceNo: 1, eventType: 'tool_called',
      createdAt: '2026-06-07T12:00:00.000Z',
      payload: { name: 'retrieve_knowledge', args: { query: 'X' } },
    },
  } as RunEvent,
  toolResult: {
    id: '2',
    type: 'tool_result',
    data: {
      id: 2, runId: 'r1', sequenceNo: 2, eventType: 'tool_result',
      createdAt: '2026-06-07T12:00:01.000Z',
      payload: { name: 'retrieve_knowledge', result: 'hits: 3 chunks' },
    },
  } as RunEvent,
  finalAnswer: {
    id: '3',
    type: 'final_answer',
    data: {
      id: 3, runId: 'r1', sequenceNo: 3, eventType: 'final_answer',
      createdAt: '2026-06-07T12:00:02.000Z',
      payload: { content: 'done summary' },
    },
  } as RunEvent,
};
