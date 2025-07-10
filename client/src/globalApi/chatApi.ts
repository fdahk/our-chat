import { get } from '@/utils/http';
import type { Conversation } from '@/globalType/conversation';
import type { Message } from '@/globalType/message';

// 获取会话列表
export const getConversationList = async (userId: number) => {
  const res = await get<Conversation[]>(`/user/conversation?userId=${userId}`);
  // console.log('res', res); // 调试
  return res;
};

// 获取会话消息
export const getConversationMessages = async (conversationId: string) => {
  const res = await get<Message[]>(`/user/conversation/messages?conversationId=${conversationId}`);
  // console.log('res', res); // 调试
  return res;
};
