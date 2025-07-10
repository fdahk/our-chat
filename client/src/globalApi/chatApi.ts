import { get } from '@/utils/http';
import type { Conversation, ConvMessage } from '@/globalType/conversation';

// 获取会话列表
export const getConversationList = async (userId: number) => {
  const res = await get<Conversation[]>(`/user/conversation?userId=${userId}`);
  // console.log('res', res); // 调试
  return res;
};

// 获取所有会话消息
export const getConversationMessages = async (userId: number) => {
  const res = await get<ConvMessage>(`/user/conversation/messages?userId=${userId}`);
  // console.log('res', res); // 调试
  return res;
};
