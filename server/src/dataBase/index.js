// 推荐安装@types/mongodb 和 @types/mongoose
// import { MongoClient } from 'mongodb'; //原生MongoClient，需要手动管理数据结构，没有Schema验证
// const client = new MongoClient(process.env.MONGODB_URI);

import mongoose from 'mongoose'; //Mongoose，提供Schema验证，自动管理数据结构
const URL = 'mongodb://localhost:27017/our-chat';
export const connectDB = async () => {
    try {
        await mongoose.connect(URL);
        console.log('MongoDB连接成功');
    } catch (error) {
        console.error('MongoDB连接失败:', error);
        process.exit(1);
    }
};

// 断开连接
export const disconnectDB = async () => {
    try {
        await mongoose.disconnect();
        console.log('MongoDB断开连接');
    } catch (error) {
        console.error('MongoDB断开连接失败:', error);
    }
};