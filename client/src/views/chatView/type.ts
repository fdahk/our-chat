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

// 会话查询响应类型
export interface ApiResponse<T> {
  success: boolean;
  data: T;
}

// 消息类型
export interface Message {
    conversationId: string;
    senderId: string;
    content: string;
    type: string; 
    status: string; 
    mentions: string[];
    isEdited: boolean;
    isDeleted: boolean;
    extra: {
      timestamp: string;
      [key: string]: any;
    };
    editHistory: any[];
    createdAt: string;
    updatedAt: string;
  }