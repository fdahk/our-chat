import { z } from 'zod';

// 实时与 REST 的消息相关入参契约。作为前后端对齐的单一真相,
// 同时满足"外部输入必须 runtime 校验"——上行入参一律先过 schema 再进落库路径。

// 上行发消息(socket: message.send)
export const sendMessageInput = z.object({
  // 客户端幂等键:重发复用同键。服务端靠它 + 唯一约束去重。
  clientMsgId: z.string().min(1).max(64),
  conversationId: z.string().min(1).max(100),
  // senderId 仅作前端回显参考,服务端以握手验签的 socket.userId 为准,不信任此值。
  senderId: z.union([z.string(), z.number()]).optional(),
  content: z.string().default(''),
  type: z.string().max(32).default('text'),
  mentions: z.array(z.union([z.string(), z.number()])).default([]),
  extra: z.record(z.string(), z.unknown()).optional(),
  fileInfo: z.record(z.string(), z.unknown()).optional(),
});
export type SendMessageInput = z.infer<typeof sendMessageInput>;

// 下行增量补拉(REST: GET /user/sync?conv=&since=&limit=)
export const syncQuery = z.object({
  conv: z.string().min(1).max(100),
  // query 都是字符串,这里强制为非负整数序号(seq 是 BIGINT,用 string 承接避免精度丢失)。
  since: z
    .string()
    .regex(/^\d+$/, 'since 必须为非负整数')
    .default('0'),
  limit: z
    .string()
    .regex(/^\d+$/)
    .optional(),
});
export type SyncQuery = z.infer<typeof syncQuery>;

// 已读上报(REST: POST /user/read)
export const readReportInput = z.object({
  conversationId: z.string().min(1).max(100),
  uptoSeq: z
    .union([z.string().regex(/^\d+$/), z.number().int().nonnegative()])
    .transform((v) => BigInt(v)),
});
export type ReadReportInput = z.infer<typeof readReportInput>;
