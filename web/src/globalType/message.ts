// REST 实体(Message/FileInfo)来自 OpenAPI 单一契约;
// 上行 WS 事件类型(SendMessageInput/Ack)属事件层,仍由 proto 描述。
export type { Message, FileInfo } from '../contracts/openapi';
export type {
  SendMessageInput,
  SendMessageAck,
} from '../contracts/gen/ourchat/message/v1/message';
