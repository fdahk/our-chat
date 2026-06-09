// agent-server 返回数据契约。镜像 /Users/mac/agent-server 的 DTO,字段尽量按其原样。
// 仅保留前端用到的字段;agent-server 加字段时这里前向兼容(多余字段 TS 不报错)。

// ── 鉴权 ────────────────────────────────────────────────────────────
// 契约对齐 agent-server/apps/node-server/src/modules/auth/dto/auth-response.dto.ts。
// 只有 token + user 两个字段;无 tokenType / expiresIn(早先按 OAuth 习惯臆造)。
export interface AgentLoginResp {
  token: string;
  user: AgentUser;
}

// 服务端 AuthUserDto 字段全是 `!:`(必填);写成可选会让消费者错过空值校验。
export interface AgentUser {
  id: number;
  username: string;
  displayName: string;
  roleCode: string;
}

// ── 文档 ────────────────────────────────────────────────────────────
export type DocStatus =
  | 'uploaded'
  | 'parsing'
  | 'chunking'
  | 'embedding'
  | 'ready'
  | 'failed';

// 字段名对齐 agent-server/apps/node-server/prisma/schema.prisma 的 Document model:
// sizeBytes(@map size_bytes)、errorMsg(@map error_msg)、chunkCount(@map chunk_count)。
// Prisma client 返回 JS camelCase,直接消费即可。
export interface AgentDocument {
  id: number;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: DocStatus;
  chunkCount: number;
  errorMsg?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UploadDocResp {
  documentId: number;
  runId: string;
}

// ── 对话 ────────────────────────────────────────────────────────────
export type MessageRole = 'user' | 'assistant' | 'system';

export interface Citation {
  chunkId: number;
  documentId: number;
  filename?: string;
  score: number;
}

export interface AgentMessage {
  id: number;
  conversationId: number;
  role: MessageRole;
  content: string;
  citations?: Citation[] | null;
  createdAt: string;
}

export interface AgentConversation {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages?: AgentMessage[];
}

// ── SSE 事件 ────────────────────────────────────────────────────────

// 对话流事件
export type ChatStreamEvent =
  | { type: 'token'; value: string }
  | { type: 'done'; messageId: number; citations: Citation[] }
  | { type: 'error'; message: string };

// Run 事件(文档摄取 / agent 任务)
export type RunEventType =
  | 'run_started'
  | 'run_completed'
  | 'run_failed'
  | 'progress'
  | 'tool_called'
  | 'tool_result'
  | 'final_answer'
  // ingestion 专属
  | 'ingestion_parsed'
  | 'ingestion_chunked'
  | 'ingestion_embedded';

// agent-server 把 sequenceNo 转成 string 给 SSE id(MessageEvent.lastEventId
// 协议本就是 string)。这里保持 string 不再 Number(),避免非纯数字 id 被吞成 0。
export interface RunEvent {
  id: string;
  type: RunEventType;
  data: Record<string, unknown>;
}

// ── Run 元信息 ─────────────────────────────────────────────────────
export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface AgentRun {
  runId: string;
  kind: 'ingestion' | 'agent_task';
  status: RunStatus;
  progressMsg?: string | null;
  createdAt: string;
  events?: RunEvent[];
}

// ── Agent 任务 ─────────────────────────────────────────────────────
export interface AgentTaskResp {
  runId: string;
}
