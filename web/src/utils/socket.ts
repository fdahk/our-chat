// io 工厂函数和 Socket 类型，用于创建和类型标注 socket 连接
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from './runtime';
import { getDeviceId } from './device';

// 配置 options(socket连接配置项)
const options = {
  autoConnect: false, // 不自动连接，需要手动调用 connect()
  // 握手时带上 HttpOnly token cookie，供服务端验签派生身份（跨域也能携带）
  withCredentials: true,
  // 上报 per-tab deviceId,供服务端做通话多标签页/多设备并发裁决(用函数,每次重连都带最新值)
  auth: (cb: (data: Record<string, unknown>) => void) => cb({ deviceId: getDeviceId() }),
  // transports: ['websocket'], // 强制只用 websocket 协议
};

// 单例模式
class SocketService {
  private static instance: Socket | null = null;

  static getInstance(): Socket {
    if (!SocketService.instance) {
      // 参数：socket地址，配置项
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
