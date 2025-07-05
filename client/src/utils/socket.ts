import { io, Socket } from 'socket.io-client';

// 后端 socket 服务的地址
const SOCKET_URL = 'http://localhost:3007'; 

// 配置 options
const options = {
  autoConnect: false, // 需要时再手动连接
  // transports: ['websocket'], // 强制使用 websocket
};

// 单例
class SocketService {
  private static instance: Socket | null = null;

  static getInstance(): Socket {
    if (!SocketService.instance) {
      SocketService.instance = io(SOCKET_URL, options);
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
