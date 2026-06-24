import type { Message } from './message';

// 用户与会话的关系(每用户每会话一行,承载已读/未读状态机)。
// 单一契约源:proto/ourchat/conversation/v1/conversation.proto(字段统一驼峰)。
// 注:本项目 wire 约定 int64 id 序列化为 number(server bigint-json polyfill)。
export interface UserConversation {
    id: number;
    userId: number;
    conversationId: string;
    lastReadMessageId: string;
    lastSyncedSeq: number;
    lastReadSeq: number;
    mentionSeq: number;
    unreadCount: number;
    isMuted: boolean;
    isPinned: boolean;
    isArchived: boolean;
    joinedAt: string;
    lastActivity: string;
}

// 会话(单聊/群聊)。
export interface Conversation {
    id: string;
    convType: string;
    title: string;
    avatar: string;
    nextSeq: number;
    createdAt: string;
    updatedAt: string;
}

// 会话消息类型:键是会话 id,值是消息列表。
export interface ConvMessage {
    [key: string]: Message[];
}
