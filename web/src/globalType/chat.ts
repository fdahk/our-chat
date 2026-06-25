import type { Message } from './message';

export type {
  Conversation,
  UserConversation,
} from '../contracts/gen/ourchat/conversation/v1/conversation';

// 会话消息类型:键是会话id，值是消息列表
export interface ConvMessage {
    [key: string]: Message[];
}
