import { get,post } from '@/utils/http';
import type { UserConversation, Conversation } from '@/globalType/chat';
import type { Message } from '@/globalType/message';

// 获取用户会话列表
export const getUserConversationList = async (userId: number) => {
  const res = await get<UserConversation[]>(`/user/userConversations?userId=${userId}`);
  return res;
};

// 获取会话列表
// 注： 不同浏览器中axios对params参数的序列化方式不同，chrome会自动省略空参数（空数组）
export const getConversationList = async (userConversations: UserConversation[]) => {
  // 性能优化：提取userConversations的conversation_id转换成id数组，减少请求参数大小
  const userConversationIds = userConversations.map(conversation => conversation.conversation_id);
  const res = await get<Conversation[]>(`/user/conversations`, { params: { userConversationIds: JSON.stringify(userConversationIds) } });
  return res;
};

// 获取会话消息
export const getConversationMessages = async (conversationId: string) => {
  const res = await get<Message[]>(`/user/messages?conversationId=${conversationId}`);
  return res;
};

// 更新会话时间（用于点击发送消息后保证对话渲染在最前面
// 注：设计为用户可以单向删除会话记录，存在好友但未必有会话记录,可能需要创建会话记录
// 不过无需担心，组件调用时使用了双方的id拼接了conversation_id
export const updateConversationTime = async (conversationId:string) => {
  const res = await post<void>(`/user/updateConversationTime`, { conversationId });
  return res;
};