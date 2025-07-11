import type { Message } from './message';

// 用户会话类型
export interface UserConversation {
    id: string;
    user_id: number;
    conversation_id: string;
    last_read_message_id: string;
    unread_count: number;
    is_muted: number;
    is_pinned: number;
    is_archived: number;
    created_at: string;
    updated_at: string;
    // 可扩展更多字段
  }
  // 会话类型 
  export interface Conversation {
    id: string;
    conv_type: string;
    title: string;
    avatar: string;
    created_at: string;
    updated_at: string;
  }
  // 会话消息类型
  export interface ConvMessage {
    [key: string]: Message[]; // 键是会话id，值是消息列表
  }