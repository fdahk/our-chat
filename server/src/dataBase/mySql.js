import mysql from 'mysql2/promise';

export const mySql = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'Tj@19970924',
    database: 'our_chat',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});

// 初始化数据库
export const init = async () => {
    const sql = `
        -- 使用数据库
        use our_chat;

        -- 1. 用户表
        CREATE TABLE IF NOT EXISTS users (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            username VARCHAR(50) NOT NULL UNIQUE COMMENT '用户名',
            email VARCHAR(100) UNIQUE COMMENT '邮箱',
            phone VARCHAR(20) UNIQUE COMMENT '手机号',
            password VARCHAR(255) NOT NULL COMMENT '密码哈希',
            nickname VARCHAR(50) COMMENT '昵称',
            avatar VARCHAR(255) COMMENT '头像URL',
            bio TEXT COMMENT '个人简介',
            status ENUM('online', 'offline', 'busy', 'away') DEFAULT 'offline' COMMENT '在线状态',
            last_seen DATETIME COMMENT '最后上线时间',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

        -- 2. 群组表
        CREATE TABLE IF NOT EXISTS user_groups (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            name VARCHAR(100) NOT NULL COMMENT '群名称',
            description TEXT COMMENT '群描述',
            avatar VARCHAR(255) COMMENT '群头像',
            owner_id BIGINT NOT NULL COMMENT '群主ID',
            max_members INT DEFAULT 500 COMMENT '最大成员数',
            group_type ENUM('public', 'private') DEFAULT 'private' COMMENT '群类型',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='群组表';

        -- 3. 好友关系表
        CREATE TABLE IF NOT EXISTS friendships (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            user_id BIGINT NOT NULL COMMENT '用户ID',
            friend_id BIGINT NOT NULL COMMENT '好友ID',
            status ENUM('pending', 'accepted', 'blocked') DEFAULT 'pending' COMMENT '好友状态',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE KEY unique_friendship (user_id, friend_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='好友关系表';

        -- 4. 群组成员表
        CREATE TABLE IF NOT EXISTS group_members (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            group_id BIGINT NOT NULL COMMENT '群组ID',
            user_id BIGINT NOT NULL COMMENT '用户ID',
            role ENUM('owner', 'admin', 'member') DEFAULT 'member' COMMENT '角色',
            nickname VARCHAR(50) COMMENT '群内昵称',
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE KEY unique_member (group_id, user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='群组成员表';

        -- 5. 会话表
        CREATE TABLE IF NOT EXISTS conversations (
            id VARCHAR(100) PRIMARY KEY COMMENT '会话ID',
            conv_type ENUM('single', 'group') NOT NULL COMMENT '会话类型',
            title VARCHAR(100) COMMENT '会话标题',
            avatar VARCHAR(255) COMMENT '会话头像',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='会话表';

        -- 6. 用户会话关系表
        CREATE TABLE IF NOT EXISTS user_conversations (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            user_id BIGINT NOT NULL COMMENT '用户ID',
            conversation_id VARCHAR(100) NOT NULL COMMENT '会话ID',
            last_read_message_id VARCHAR(50) COMMENT '最后读取的消息ID',
            unread_count INT DEFAULT 0 COMMENT '未读消息数',
            is_muted BOOLEAN DEFAULT FALSE COMMENT '是否静音',
            is_pinned BOOLEAN DEFAULT FALSE COMMENT '是否置顶',
            is_archived BOOLEAN DEFAULT FALSE COMMENT '是否归档',
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_activity DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
            UNIQUE KEY unique_user_conversation (user_id, conversation_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户会话关系表';

        -- 7. 消息引用表
        CREATE TABLE IF NOT EXISTS message_refs (
            id VARCHAR(50) PRIMARY KEY COMMENT '消息ID（对应MongoDB）',
            conversation_id VARCHAR(100) NOT NULL COMMENT '会话ID',
            sender_id BIGINT NOT NULL COMMENT '发送者ID',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
            FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='消息引用表';
    `
    try {
        await mySql.execute(sql)
        console.log('MySQL 数据库结构初始化完成')
    } catch (error) {
        console.error('数据库初始化失败:', error)
        throw error
    }
};

