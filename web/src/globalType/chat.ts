import type { Message } from './message';

export type {
  Conversation,
  UserConversation,
} from '../contracts/openapi';

// 会话消息类型:键是会话id，值是消息列表
export interface ConvMessage {
    [key: string]: Message[];
}
