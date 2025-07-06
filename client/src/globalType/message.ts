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
    extra: {};
    timestamp: string; // 注：数据库及后端都是Date类型，后端传给前端时，Date 会被序列化为字符串，前端采用string类型
    editHistory: any[];
    createdAt: string;
    updatedAt: string;
  }