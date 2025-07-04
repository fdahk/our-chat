// 测试数据
import { mySql } from './mySql.js';
import { connectDB, Message, ConversationCache, UserConversationState, FileInfo } from './mongoDB.js';
import { v4 as uuidv4 } from 'uuid'; // 一个 Node.js 库，用于生成 UUID（Universally Unique Identifier） - 通用唯一标识符。npm install uuid

export const seedData = async () => {
    try {
        // 连接数据库
        await connectDB();
        console.log('开始生成模拟数据...');

        // 1. 创建用户数据
        // await createUsers();
        
        // 2. 创建好友关系
        // await createFriendships();
        
        // 3. 创建群组
        // await createGroups();
        
        // 4. 创建会话
        // await createConversations();
        
        // 5. 创建消息数据
        await createMessages();
        
        console.log('✅ 模拟数据生成完成！');
    } catch (error) {
        console.error('❌ 数据生成失败:', error);
    }
};

// 1. 创建用户数据
const createUsers = async () => {
    console.log('📝 创建用户数据...');
    
    const users = [
        {
            username: 'alice',
            email: 'alice@example.com',
            password: '$2b$10$hashedpassword1', // 实际应该是加密后的密码
            nickname: '爱丽丝',
            avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alice',
            bio: '热爱编程的产品经理',
            status: 'online'
        },
        {
            username: 'bob',
            email: 'bob@example.com',
            password: '$2b$10$hashedpassword2',
            nickname: '鲍勃',
            avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=bob',
            bio: '全栈开发工程师',
            status: 'online'
        },
        {
            username: 'charlie',
            email: 'charlie@example.com',
            password: '$2b$10$hashedpassword3',
            nickname: '查理',
            avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=charlie',
            bio: 'UI/UX 设计师',
            status: 'away'
        },
        {
            username: 'diana',
            email: 'diana@example.com',
            password: '$2b$10$hashedpassword4',
            nickname: '戴安娜',
            avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=diana',
            bio: '数据分析师',
            status: 'busy'
        },
        {
            username: 'eve',
            email: 'eve@example.com',
            password: '$2b$10$hashedpassword5',
            nickname: '夏娃',
            avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=eve',
            bio: '项目经理',
            status: 'offline'
        }
    ];

    for (const user of users) {
        await mySql.execute(`
            INSERT INTO users (username, email, password, nickname, avatar, bio, status, last_seen)
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
        `, [user.username, user.email, user.password, user.nickname, user.avatar, user.bio, user.status]);
    }
    
    console.log('✅ 用户数据创建完成');
};

// 2. 创建好友关系
const createFriendships = async () => {
    console.log('🤝 创建好友关系...');
    
    const friendships = [
        // Alice 的好友
        { user_id: 1, friend_id: 2, status: 'accepted' }, // Alice ↔ Bob
        { user_id: 2, friend_id: 1, status: 'accepted' },
        { user_id: 1, friend_id: 3, status: 'accepted' }, // Alice ↔ Charlie
        { user_id: 3, friend_id: 1, status: 'accepted' },
        { user_id: 1, friend_id: 4, status: 'pending' },  // Alice → Diana (待确认)
        
        // Bob 的好友
        { user_id: 2, friend_id: 3, status: 'accepted' }, // Bob ↔ Charlie
        { user_id: 3, friend_id: 2, status: 'accepted' },
        { user_id: 2, friend_id: 5, status: 'accepted' }, // Bob ↔ Eve
        { user_id: 5, friend_id: 2, status: 'accepted' },
        
        // Charlie 的好友
        { user_id: 3, friend_id: 4, status: 'accepted' }, // Charlie ↔ Diana
        { user_id: 4, friend_id: 3, status: 'accepted' },
        
        // Diana 的好友
        { user_id: 4, friend_id: 5, status: 'blocked' },  // Diana blocked Eve
    ];

    for (const friendship of friendships) {
        await mySql.execute(`
            INSERT INTO friendships (user_id, friend_id, status)
            VALUES (?, ?, ?)
        `, [friendship.user_id, friendship.friend_id, friendship.status]);
    }
    
    console.log('✅ 好友关系创建完成');
};

// 3. 创建群组
const createGroups = async () => {
    console.log('👥 创建群组...');
    
    // 创建群组
    const groups = [
        {
            name: '前端开发小组',
            description: '讨论前端技术和最佳实践',
            avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=FE',
            owner_id: 1, // Alice 是群主
            group_type: 'private'
        },
        {
            name: '产品设计团队',
            description: '产品设计相关讨论',
            avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=PD',
            owner_id: 3, // Charlie 是群主
            group_type: 'public'
        },
        {
            name: '技术分享群',
            description: '分享技术文章和学习心得',
            avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=TS',
            owner_id: 2, // Bob 是群主
            group_type: 'public'
        }
    ];

    for (const group of groups) {
        await mySql.execute(`
            INSERT INTO user_groups (name, description, avatar, owner_id, group_type)
            VALUES (?, ?, ?, ?, ?)
        `, [group.name, group.description, group.avatar, group.owner_id, group.group_type]);
    }

    // 添加群组成员
    const groupMembers = [
        // 前端开发小组 (group_id: 1)
        { group_id: 1, user_id: 1, role: 'owner' },     // Alice (群主)
        { group_id: 1, user_id: 2, role: 'admin' },     // Bob (管理员)
        { group_id: 1, user_id: 3, role: 'member' },    // Charlie (成员)
        { group_id: 1, user_id: 5, role: 'member' },    // Eve (成员)
        
        // 产品设计团队 (group_id: 2)
        { group_id: 2, user_id: 3, role: 'owner' },     // Charlie (群主)
        { group_id: 2, user_id: 1, role: 'member' },    // Alice (成员)
        { group_id: 2, user_id: 4, role: 'member' },    // Diana (成员)
        
        // 技术分享群 (group_id: 3)
        { group_id: 3, user_id: 2, role: 'owner' },     // Bob (群主)
        { group_id: 3, user_id: 1, role: 'admin' },     // Alice (管理员)
        { group_id: 3, user_id: 3, role: 'member' },    // Charlie (成员)
        { group_id: 3, user_id: 4, role: 'member' },    // Diana (成员)
        { group_id: 3, user_id: 5, role: 'member' },    // Eve (成员)
    ];

    for (const member of groupMembers) {
        await mySql.execute(`
            INSERT INTO group_members (group_id, user_id, role)
            VALUES (?, ?, ?)
        `, [member.group_id, member.user_id, member.role]);
    }
    
    console.log('✅ 群组数据创建完成');
};

// 4. 创建会话
const createConversations = async () => {
    console.log('💬 创建会话...');
    
    const conversations = [
        // 单聊会话
        { id: 'single_1_2', conv_type: 'single', title: null, avatar: null },  // Alice ↔ Bob
        { id: 'single_1_3', conv_type: 'single', title: null, avatar: null },  // Alice ↔ Charlie
        { id: 'single_2_3', conv_type: 'single', title: null, avatar: null },  // Bob ↔ Charlie
        { id: 'single_2_5', conv_type: 'single', title: null, avatar: null },  // Bob ↔ Eve
        { id: 'single_3_4', conv_type: 'single', title: null, avatar: null },  // Charlie ↔ Diana
        
        // 群聊会话
        { id: 'group_1', conv_type: 'group', title: '前端开发小组', avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=FE' },
        { id: 'group_2', conv_type: 'group', title: '产品设计团队', avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=PD' },
        { id: 'group_3', conv_type: 'group', title: '技术分享群', avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=TS' }
    ];

    for (const conv of conversations) {
        await mySql.execute(`
            INSERT INTO conversations (id, conv_type, title, avatar)
            VALUES (?, ?, ?, ?)
        `, [conv.id, conv.conv_type, conv.title, conv.avatar]);
    }

    // 创建用户会话关系
    const userConversations = [
        // 单聊关系
        { user_id: 1, conversation_id: 'single_1_2', unread_count: 2, is_pinned: true },
        { user_id: 2, conversation_id: 'single_1_2', unread_count: 0, is_pinned: false },
        { user_id: 1, conversation_id: 'single_1_3', unread_count: 0, is_pinned: false },
        { user_id: 3, conversation_id: 'single_1_3', unread_count: 1, is_pinned: false },
        { user_id: 2, conversation_id: 'single_2_3', unread_count: 0, is_pinned: false },
        { user_id: 3, conversation_id: 'single_2_3', unread_count: 3, is_pinned: false },
        { user_id: 2, conversation_id: 'single_2_5', unread_count: 1, is_pinned: false },
        { user_id: 5, conversation_id: 'single_2_5', unread_count: 0, is_pinned: false },
        { user_id: 3, conversation_id: 'single_3_4', unread_count: 0, is_pinned: false },
        { user_id: 4, conversation_id: 'single_3_4', unread_count: 2, is_pinned: true },
        
        // 群聊关系
        { user_id: 1, conversation_id: 'group_1', unread_count: 5, is_pinned: true },
        { user_id: 2, conversation_id: 'group_1', unread_count: 0, is_pinned: false },
        { user_id: 3, conversation_id: 'group_1', unread_count: 5, is_pinned: false },
        { user_id: 5, conversation_id: 'group_1', unread_count: 5, is_pinned: false },
        
        { user_id: 3, conversation_id: 'group_2', unread_count: 0, is_pinned: true },
        { user_id: 1, conversation_id: 'group_2', unread_count: 2, is_pinned: false },
        { user_id: 4, conversation_id: 'group_2', unread_count: 2, is_pinned: false },
        
        { user_id: 2, conversation_id: 'group_3', unread_count: 0, is_pinned: true },
        { user_id: 1, conversation_id: 'group_3', unread_count: 3, is_pinned: false },
        { user_id: 3, conversation_id: 'group_3', unread_count: 3, is_pinned: false },
        { user_id: 4, conversation_id: 'group_3', unread_count: 3, is_pinned: false },
        { user_id: 5, conversation_id: 'group_3', unread_count: 3, is_pinned: false }
    ];

    for (const userConv of userConversations) {
        await mySql.execute(`
            INSERT INTO user_conversations (user_id, conversation_id, unread_count, is_pinned)
            VALUES (?, ?, ?, ?)
        `, [userConv.user_id, userConv.conversation_id, userConv.unread_count, userConv.is_pinned]);
    }
    
    console.log('✅ 会话数据创建完成');
};

// 5. 创建消息数据
const createMessages = async () => {
    console.log('📨 创建消息数据...');
    
    const messages = [];
    const baseTime = new Date('2025-01-27T10:00:00Z');
    
    // Alice ↔ Bob 的单聊消息
    messages.push(
        {
            _id: uuidv4(),
            conversationId: 'single_1_2',
            senderId: '1',
            content: '嗨 Bob！今天的项目进展怎么样？',
            type: 'text',
            timestamp: new Date(baseTime.getTime() + 1000 * 60 * 1)
        },
        {
            _id: uuidv4(),
            conversationId: 'single_1_2',
            senderId: '2',
            content: '进展不错！前端页面基本完成了，正在做优化',
            type: 'text',
            timestamp: new Date(baseTime.getTime() + 1000 * 60 * 3)
        },
        {
            _id: uuidv4(),
            conversationId: 'single_1_2',
            senderId: '1',
            content: '太棒了！有什么需要我帮忙的吗？',
            type: 'text',
            timestamp: new Date(baseTime.getTime() + 1000 * 60 * 5)
        },
        {
            _id: uuidv4(),
            conversationId: 'single_1_2',
            senderId: '2',
            content: 'https://picsum.photos/800/600?random=1',
            type: 'image',
            extra: {
                url: 'https://picsum.photos/800/600?random=1',
                thumbnail: 'https://picsum.photos/200/150?random=1',
                width: 800,
                height: 600
            },
            timestamp: new Date(baseTime.getTime() + 1000 * 60 * 7)
        },
        {
            _id: uuidv4(),
            conversationId: 'single_1_2',
            senderId: '2',
            content: '这是最新的设计稿，你看看怎么样',
            type: 'text',
            timestamp: new Date(baseTime.getTime() + 1000 * 60 * 8)
        }
    );

    // Alice ↔ Charlie 的单聊消息
    messages.push(
        {
            _id: uuidv4(),
            conversationId: 'single_1_3',
            senderId: '3',
            content: 'Alice，新的 UI 组件库已经更新了！',
            type: 'text',
            timestamp: new Date(baseTime.getTime() + 1000 * 60 * 10)
        },
        {
            _id: uuidv4(),
            conversationId: 'single_1_3',
            senderId: '1',
            content: '哇，这么快！发个链接给我看看',
            type: 'text',
            timestamp: new Date(baseTime.getTime() + 1000 * 60 * 12)
        },
        {
            _id: uuidv4(),
            conversationId: 'single_1_3',
            senderId: '3',
            content: 'design-system.pdf',
            type: 'file',
            extra: {
                fileName: 'design-system.pdf',
                fileSize: 2048576,
                mimeType: 'application/pdf',
                url: 'https://example.com/files/design-system.pdf'
            },
            timestamp: new Date(baseTime.getTime() + 1000 * 60 * 14)
        }
    );

    // 前端开发小组的群聊消息
    messages.push(
        {
            _id: uuidv4(),
            conversationId: 'group_1',
            senderId: '1',
            content: '大家好！今天我们讨论一下新版本的技术选型',
            type: 'text',
            timestamp: new Date(baseTime.getTime() + 1000 * 60 * 20)
        },
        {
            _id: uuidv4(),
            conversationId: 'group_1',
            senderId: '2',
            content: '我建议使用 React 18 + TypeScript',
            type: 'text',
            timestamp: new Date(baseTime.getTime() + 1000 * 60 * 22)
        },
        {
            _id: uuidv4(),
            conversationId: 'group_1',
            senderId: '3',
            content: '同意！TypeScript 能大大提升代码质量',
            type: 'text',
            timestamp: new Date(baseTime.getTime() + 1000 * 60 * 24)
        },
        {
            _id: uuidv4(),
            conversationId: 'group_1',
            senderId: '1',
            content: '@Bob @Charlie 你们觉得状态管理用什么？',
            type: 'text',
            mentions: ['2', '3'],
            timestamp: new Date(baseTime.getTime() + 1000 * 60 * 26)
        },
        {
            _id: uuidv4(),
            conversationId: 'group_1',
            senderId: '2',
            content: 'Zustand 比较轻量，推荐！',
            type: 'text',
            replyTo: {
                messageId: messages[messages.length - 1]._id,
                content: '@Bob @Charlie 你们觉得状态管理用什么？',
                senderId: '1'
            },
            timestamp: new Date(baseTime.getTime() + 1000 * 60 * 28)
        },
        {
            _id: uuidv4(),
            conversationId: 'group_1',
            senderId: '5',
            content: '👍',
            type: 'emoji',
            timestamp: new Date(baseTime.getTime() + 1000 * 60 * 30)
        }
    );

    // 技术分享群的消息
    messages.push(
        {
            _id: uuidv4(),
            conversationId: 'group_3',
            senderId: '2',
            content: '分享一篇很不错的文章：《深入理解 React Hooks》',
            type: 'text',
            timestamp: new Date(baseTime.getTime() + 1000 * 60 * 40)
        },
        {
            _id: uuidv4(),
            conversationId: 'group_3',
            senderId: '4',
            content: '收藏了！最近正在学习 Hooks',
            type: 'text',
            timestamp: new Date(baseTime.getTime() + 1000 * 60 * 42)
        },
        {
            _id: uuidv4(),
            conversationId: 'group_3',
            senderId: '1',
            content: '我也推荐一下这个课程',
            type: 'text',
            timestamp: new Date(baseTime.getTime() + 1000 * 60 * 44)
        },
        {
            _id: uuidv4(),
            conversationId: 'group_3',
            senderId: '1',
            content: 'react-advanced-course.zip',
            type: 'file',
            extra: {
                fileName: 'react-advanced-course.zip',
                fileSize: 15728640,
                mimeType: 'application/zip',
                url: 'https://example.com/files/react-course.zip'
            },
            timestamp: new Date(baseTime.getTime() + 1000 * 60 * 45)
        }
    );

    // 系统消息示例
    messages.push(
        {
            _id: uuidv4(),
            conversationId: 'group_1',
            senderId: 'system',
            content: 'Eve 加入了群聊',
            type: 'system',
            extra: {
                systemType: 'join',
                targetUsers: ['5']
            },
            timestamp: new Date(baseTime.getTime() + 1000 * 60 * 50)
        }
    );

    // 保存消息到 MongoDB
    for (const msg of messages) {
        await new Message(msg).save();
        
        // 同时在 MySQL 中创建消息引用
        await mySql.execute(`
            INSERT INTO message_refs (id, conversation_id, sender_id)
            VALUES (?, ?, ?)
        `, [msg._id, msg.conversationId, msg.senderId === 'system' ? 1 : msg.senderId]);
    }

    // 创建会话缓存
    const conversationCaches = [
        {
            _id: 'single_1_2',
            type: 'single',
            participants: ['1', '2'],
            lastMessage: {
                id: messages[4]._id,
                content: '这是最新的设计稿，你看看怎么样',
                senderId: '2',
                senderName: '鲍勃',
                type: 'text',
                timestamp: messages[4].timestamp
            },
            totalMessages: 5
        },
        {
            _id: 'group_1',
            type: 'group',
            title: '前端开发小组',
            participants: ['1', '2', '3', '5'],
            lastMessage: {
                id: messages[messages.length - 1]._id,
                content: 'Eve 加入了群聊',
                senderId: 'system',
                senderName: '系统',
                type: 'system',
                timestamp: messages[messages.length - 1].timestamp
            },
            totalMessages: 7
        }
    ];

    for (const cache of conversationCaches) {
        await new ConversationCache(cache).save();
    }

    // 创建用户会话状态
    const userStates = [
        {
            userId: '1',
            conversationId: 'single_1_2',
            lastReadMessageId: messages[2]._id,
            lastReadTime: messages[2].timestamp,
            typing: false
        },
        {
            userId: '2',
            conversationId: 'single_1_2',
            lastReadMessageId: messages[4]._id,
            lastReadTime: messages[4].timestamp,
            typing: false
        },
        {
            userId: '2',
            conversationId: 'group_1',
            lastReadMessageId: messages[messages.length - 1]._id,
            lastReadTime: new Date(),
            typing: false
        }
    ];

    for (const state of userStates) {
        await new UserConversationState(state).save();
    }

    // 创建文件信息
    const fileInfos = [
        {
            _id: uuidv4(),
            originalName: 'design-system.pdf',
            fileName: 'design-system-20250127.pdf',
            mimeType: 'application/pdf',
            size: 2048576,
            url: 'https://example.com/files/design-system.pdf',
            uploaderId: '3',
            conversationId: 'single_1_3',
            messageId: messages.find(m => m.type === 'file' && m.conversationId === 'single_1_3')._id
        },
        {
            _id: uuidv4(),
            originalName: 'react-advanced-course.zip',
            fileName: 'react-course-20250127.zip',
            mimeType: 'application/zip',
            size: 15728640,
            url: 'https://example.com/files/react-course.zip',
            uploaderId: '1',
            conversationId: 'group_3',
            messageId: messages.find(m => m.type === 'file' && m.conversationId === 'group_3')._id
        }
    ];

    for (const fileInfo of fileInfos) {
        await new FileInfo(fileInfo).save();
    }
    
    console.log('✅ 消息数据创建完成');
};

try {
    await seedData();
} catch (error) {
    console.error('数据创建失败:', error);
}