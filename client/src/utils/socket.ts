// io 工厂函数和 Socket 类型，用于创建和类型标注 socket 连接
import { io, Socket } from 'socket.io-client';

// 后端 socket 服务的地址
const SOCKET_URL = 'http://localhost:3007'; 

// 配置 options(socket连接配置项)
const options = {
  autoConnect: false, // 不自动连接，需要手动调用 connect()
  // transports: ['websocket'], // 强制只用 websocket 协议
};

// 单例模式
class SocketService {
  private static instance: Socket | null = null;

  static getInstance(): Socket {
    if (!SocketService.instance) {
      SocketService.instance = io(SOCKET_URL, options); // 创建 socket 实例
    }
    return SocketService.instance;
  }

  // 断开连接
  static disconnect() {
    if (SocketService.instance) {
      SocketService.instance.disconnect();
      SocketService.instance = null;
    }
  }
}

export default SocketService;
