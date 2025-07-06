import type { Message } from './message';

// 会话类型
export interface Conversation {
    id: string;
    conv_type: 'group' | 'single';
    title: string | null;
    avatar: string | null;
    created_at: string;
    updated_at: string;
    // 可扩展更多字段
  }
  
  // 所有会话消息储存
  export interface ConvMessage {
    [key: string]: Message[]; // 键是会话id，值是消息列表
  }