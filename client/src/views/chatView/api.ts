import { get } from '../../utils/http';
import type { Conversation, ApiResponse } from './type';

// 获取会话列表
export const getConversationList = async (userId: number) => {
  const res = await get<ApiResponse<Conversation[]>>(`/user/conversation?userId=${userId}`);
  return res?.data ?? [];
};

