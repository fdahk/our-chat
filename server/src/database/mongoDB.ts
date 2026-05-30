import mongoose from 'mongoose';

const URL = process.env.MONGODB_URI || 'mongodb://localhost:27017/our-chat';

export const connectDb = async (): Promise<void> => {
  try {
    await mongoose.connect(URL);
    console.log('MongoDB连接成功');
  } catch (error) {
    console.error('MongoDB连接失败:', error);
    throw error;
  }
};

// 断开连接
export const disconnectDb = async (): Promise<void> => {
  try {
    await mongoose.disconnect();
    console.log('MongoDB断开连接');
  } catch (error) {
    console.error('MongoDB断开连接失败:', error);
  }
};

// 1. 消息 Schema
const messageSchema = new mongoose.Schema({
  conversationId: { type: String, required: true },
  senderId: { type: Number, required: true },
  content: { type: String, required: true },
  type: { type: String, default: 'text' },
  status: { type: String, default: 'sent' },
  mentions: { type: Array, default: [] },
  isEdited: { type: Boolean, default: false },
  isDeleted: { type: Boolean, default: false },
  extra: { type: Object, default: {} },
  fileInfo: { type: Object, default: {} },
  editHistory: { type: Array, default: [] },
  timestamp: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
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
const conversationCacheSchema = new mongoose.Schema(
  {
    _id: String,
    type: { type: String, enum: ['single', 'group'] },
    title: String,
    avatar: String,
    participants: [String],
    lastMessage: { type: mongoose.Schema.Types.Mixed },
    totalMessages: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    collection: 'conversation_cache',
    timestamps: true,
  }
);

// 3. 用户会话状态
const userConversationStateSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    conversationId: { type: String, required: true, index: true },
    lastReadMessageId: String,
    lastReadTime: { type: Date, default: Date.now },
    typing: { type: Boolean, default: false },
    typingAt: Date,
  },
  {
    collection: 'user_conversation_states',
    timestamps: true,
  }
);

// 4. 文件信息
const fileInfoSchema = new mongoose.Schema(
  {
    _id: String,
    originalName: String,
    fileName: String,
    mimeType: String,
    size: Number,
    url: String,
    thumbnail: String,
    uploaderId: String,
    conversationId: String,
    messageId: String,
    uploadedAt: { type: Date, default: Date.now },
  },
  {
    collection: 'file_info',
    timestamps: true,
  }
);

export const Message = mongoose.model('Message', messageSchema);
export const ConversationCache = mongoose.model('ConversationCache', conversationCacheSchema);
export const UserConversationState = mongoose.model(
  'UserConversationState',
  userConversationStateSchema
);
export const FileInfo = mongoose.model('FileInfo', fileInfoSchema);
