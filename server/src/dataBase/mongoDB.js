// import { MongoClient } from 'mongodb'; //原生MongoClient，需要手动管理数据结构，没有Schema验证
// const client = new MongoClient(process.env.MONGODB_URI);
import mongoose from 'mongoose'; //Mongoose，提供Schema验证，自动管理数据结构

const URL = 'mongodb://localhost:27017/our-chat'; // 数据库地址

export const connectDb = async () => {
    try {
        await mongoose.connect(URL);
        console.log('MongoDB连接成功');
    } catch (error) {
        console.error('MongoDB连接失败:', error);
        process.exit(1);
    }
};

// 断开连接
export const disconnectDb = async () => {
    try {
        await mongoose.disconnect();
        console.log('MongoDB断开连接');
    } catch (error) {
        console.error('MongoDB断开连接失败:', error);
    }
};

// 定义数据结构
//  内置数据建模、校验、查询构建、中间件等功能
// mongoose.model() 将 Schema编译成 Model
// 第一个参数 'Message' 是模型名称（单数、大写）
// MongoDB 会自动创建名为 messages 的集合（复数、小写）
// 导出这个模型（mongoose.model创建的类），其他文件使用这个类创建消息实例

// 1. 消息 Schema
// const messageSchema = new mongoose.Schema({
//     _id: { type: String, required: true }, // 消息ID，与MySQL保持一致
//     conversationId: { type: String, required: true, index: true }, // 会话ID
//     senderId: { type: String, required: true, index: true }, // 发送者ID
//     content: { type: String, required: true }, // 消息内容
//     type: { type: String, enum: ['text', 'image', 'video', 'audio', 'file', 'emoji', 'location', 'contact', 'system'], default: 'text' }, // 消息类型
//     status: { type: String, enum: ['sending', 'sent', 'delivered', 'read', 'failed'], default: 'sent' }, // 消息状态
//     replyTo: { messageId: String, content: String, senderId: String }, // 回复消息
//     mentions: [String], // 提及的用户ID列表
//     isEdited: { type: Boolean, default: false }, // 是否编辑
//     editHistory: [{ content: String, editedAt: { type: Date, default: Date.now } }], // 编辑历史
//     isDeleted: { type: Boolean, default: false }, // 是否删除
//     deletedAt: Date, // 删除时间
//     extra: { // 额外信息
//         // 图片/视频消息
//         url: String, // 图片/视频URL
//         thumbnail: String, // 缩略图URL
//         width: Number, // 图片/视频宽度
//         height: Number, // 图片/视频高度
//         duration: Number, // 视频/音频时长
        
//         // 文件消息
//         fileName: String, // 文件名
//         fileSize: Number, // 文件大小
//         mimeType: String, // 文件类型
        
//         // 位置消息
//         latitude: Number, // 纬度
//         longitude: Number, // 经度
//         address: String, // 地址
        
//         // 联系人消息
//         contactName: String, // 联系人姓名
//         contactPhone: String, // 联系人电话
        
//         // 系统消息
//         systemType: String, // join, leave, kick, etc.
//         targetUsers: [String] // 目标用户ID列表
//     },
//     timestamp: { type: Date, default: Date.now, index: true } // 消息时间（索引）
// }, 
// {
//     collection: 'messages', // 集合名
//     timestamps: true // 自动添加 createdAt 和 updatedAt 字段
// });
const messageSchema = new mongoose.Schema({
  conversationId: { type: String, required: true },
  senderId: { type: String, required: true },
  content: { type: String, required: true },
  type: { type: String, default: 'text' },
  status: { type: String, default: 'sent' },
  mentions: { type: Array, default: [] },
  isEdited: { type: Boolean, default: false },
  isDeleted: { type: Boolean, default: false },
  extra: { type: Object, default: {} },
  editHistory: { type: Array, default: [] },
  timestamp: { type: Date, default: Date.now},
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// 统一用 schema.index() 声明索引
messageSchema.index({ conversationId: 1 });
messageSchema.index({ senderId: 1 });
messageSchema.index({ timestamp: 1 });
messageSchema.index({ conversationId: 1, timestamp: -1 });
messageSchema.index({ senderId: 1, timestamp: -1 });
messageSchema.index({ 'replyTo.messageId': 1 });
messageSchema.index({ mentions: 1 });

// 2. 会话缓存（用于快速查询）
const conversationCacheSchema = new mongoose.Schema({
    _id: String, // 会话ID
    type: { type: String, enum: ['single', 'group'] }, // 会话类型
    title: String, // 会话标题
    avatar: String, // 会话头像
    participants: [String], // 参与者ID列表（索引）
    // lastMessage: { type: String } Mongoose 只会把它当作一个"对象类型的字段"，但不是嵌套对象，导致你传对象时报错。
    lastMessage: { type: mongoose.Schema.Types.Mixed }, // 允许存储任意对象
    totalMessages: { type: Number, default: 0 }, // 消息总数
    createdAt: { type: Date, default: Date.now }, // 创建时间
    updatedAt: { type: Date, default: Date.now } // 更新时间
}, {
    collection: 'conversation_cache', // 集合名
    timestamps: true // 自动添加 createdAt 和 updatedAt 字段
});

// 3. 用户会话状态
const userConversationStateSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true }, // 用户ID（索引）
    conversationId: { type: String, required: true, index: true }, // 会话ID（索引）
    lastReadMessageId: String, // 最后一条已读消息ID
    lastReadTime: { type: Date, default: Date.now }, // 最后一条已读消息时间
    typing: { type: Boolean, default: false }, // 是否正在输入
    typingAt: Date // 输入时间
}, {
    collection: 'user_conversation_states', // 集合名
    timestamps: true // 自动添加 createdAt 和 updatedAt 字段
});

// 4. 文件信息
const fileInfoSchema = new mongoose.Schema({
    _id: String, // 文件ID
    originalName: String, // 原始文件名
    fileName: String, // 文件名
    mimeType: String, // 文件类型
    size: Number, // 文件大小
    url: String, // 文件URL
    thumbnail: String, // 缩略图URL
    uploaderId: String, // 上传者ID
    conversationId: String, // 会话ID
    messageId: String, // 消息ID
    uploadedAt: { type: Date, default: Date.now } // 上传时间
}, {
    collection: 'file_info', // 集合名
    timestamps: true // 自动添加 createdAt 和 updatedAt 字段
});


// 导出
export const Message = mongoose.model('Message', messageSchema); // 消息
export const ConversationCache = mongoose.model('ConversationCache', conversationCacheSchema); // 会话缓存
export const UserConversationState = mongoose.model('UserConversationState', userConversationStateSchema); // 用户会话状态
export const FileInfo = mongoose.model('FileInfo', fileInfoSchema); // 文件信息