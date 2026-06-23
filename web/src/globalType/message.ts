import type { MessageJson } from '../contracts/gen/ourchat/message/v1/message_pb';

// 消息(线上 JSON 形状)。单一契约源:proto/ourchat/message/v1/message.proto。
// 必填/可选对齐前端实际用法:id/clientMsgId/seq 由服务端分配,乐观发送时缺省 → 可选;
// 其余收发后均存在 → 必填。extra/editHistory 用非递归类型(protobuf JsonObject 是递归
// JsonValue,会让 Redux Immer 的 WritableDraft 触发 "excessively deep")。fileInfo 沿用生成类型。
// 注:id 类字段(id/senderId/mentions)按 int64 JSON 映射为 string。
export type Message = Pick<MessageJson, 'fileInfo'> & {
  id?: string;
  clientMsgId?: string;
  seq?: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: string;
  status: string;
  mentions: string[];
  isEdited: boolean;
  isDeleted: boolean;
  timestamp: string;
  createdAt: string;
  updatedAt: string;
  extra: Record<string, unknown>;
  editHistory: Array<Record<string, unknown>>;
};
