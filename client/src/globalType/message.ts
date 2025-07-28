// 消息类型
export interface Message {
    conversationId: string;
    // 注：项目代码类型混乱，统一数据库、后端、前端，当数据为数字id时，全部统一为number类型
    // 注： 前端修改类型时会有类型提示，后端要检查的类型修改包括（mongo的schema、后端接口部分
    senderId: number; 
    content: string;
    type: string;  // 'text' | 'file'
    status: string; 
    mentions: number[];
    isEdited: boolean;
    isDeleted: boolean;
    extra: {};
    fileInfo?: {  // 新增：文件信息（文件消息特有）
        fileName: string;
        fileSize: number;
        fileUrl: string;
        fileType: string;
        fileMD5?: string;
    };
    timestamp: string; // 注：数据库及后端都是Date类型，后端传给前端时，Date 会被序列化为字符串，前端采用string类型
    editHistory: any[];
    createdAt: string;
    updatedAt: string;
  }