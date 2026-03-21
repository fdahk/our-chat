sequenceDiagram
    participant A as 发起方 A
    participant Server as 信令服务器
    participant B as 接收方 B
    
    Note over A,B: 1. 发起通话阶段
    A->>A: getUserMedia() 获取麦克风权限
    A->>A: createOffer() 创建 SDP Offer
    A->>Server: call:start {callId, from, to, offer}
    Server->>B: call:start 转发通话邀请
    
    Note over A,B: 2. ICE 候选收集 (并行进行)
    A->>A: 收集 ICE 候选
    A->>Server: call:ice {callId, candidate}
    Server->>B: call:ice 转发候选给 B
    
    Note over A,B: 3. 接受通话阶段
    B->>B: getUserMedia() 获取麦克风权限
    B->>B: setRemoteDescription(offer)
    B->>B: createAnswer() 创建 SDP Answer
    B->>B: setLocalDescription(answer)
    B->>Server: call:accept {callId, from, to, answer}
    Server->>A: call:accept 转发 Answer
    
    Note over A,B: 4. 完成连接
    A->>A: setRemoteDescription(answer)
    B->>B: 收集 ICE 候选
    B->>Server: call:ice {callId, candidate}
    Server->>A: call:ice 转发候选给 A
    
    Note over A,B: 5. P2P 连接建立
    A<-->B: WebRTC P2P 音频传输