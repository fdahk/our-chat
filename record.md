7.23 : 
    1.全局消息监听器的位置问题 
    2.前后端socket会话房间数据类型不匹配问题 
    3.store状态混乱问题 

7.24：文件传输模块
    后端新增依赖：npm install sharp archiver
    前端新增依赖：npm install crypto-js     
                 npm install @types/crypto-js
    功能特性：
    单文件上传 - 支持基础的单文件上传
    多文件上传 - 支持批量文件上传
    大文件上传 - 自动检测文件大小，大文件使用分片上传
    分片上传 - 将大文件分成小块上传，提高成功率
    流式上传 - 支持流式数据上传
    压缩上传 - 图片文件自动压缩，减少传输大小
    断点续传 - 支持暂停和恢复上传，已上传分片不重复传输
    文件秒传 - 通过MD5检测，相同文件直接返回链接

    文件上传模块架构：
    ┌─────────────────────────────────────────────────────────────┐
    │                    前端层 (React + TypeScript)               │
    ├─────────────────────────────────────────────────────────────┤
    │  FileUploader组件  ← 当前文件                                │
    │  ├── 用户界面交互                                            │
    │  ├── 文件选择和验证                                          │
    │  ├── 状态管理                                                │
    │  └── 进度跟踪                                                │
    ├─────────────────────────────────────────────────────────────┤
    │  工具函数层 (utils/upload.ts)                                │
    │  ├── 文件处理工具                                            │
    │  ├── HTTP请求封装                                            │
    │  └── 类型定义                                                │
    ├─────────────────────────────────────────────────────────────┤
    │                    后端层 (Node.js + Express)                │
    │  ├── 文件接收和存储                                          │
    │  ├── 分片处理                                                │
    │  ├── 文件合并                                                │
    │  └── 静态文件服务                                            │
    └─────────────────────────────────────────────────────────────┘

    3.分片上传时，分片文件没有被存储到 uploads/chunks 目录，而是被存储到了主目录 uploads/ 
        后端 multer 存储配置依赖于 req.body.uploadType 判断分片类型
        但实际上传时，req.body 只有在 application/x-www-form-urlencoded 或 application/json 时才会被正确解析。
            而前端用的是 FormData，此时 multer 只能在文件字段后面才解析 req.body，在 destination 和 filename 回调时，req.body 还没有被填充
        后端处理请求：
            router.post('/chunk', upload.single('chunk'), async (req, res) => {}) //参数：路由路径    multer中间件      路由处理函数
            中间可以添加任意中间件
        // 中间件按照定义顺序依次执行：
            1. 路由匹配 '/chunk'
            2. upload.single('chunk') 处理文件上传
            3. 最后执行路由处理函数
        // multer 的解析顺序：
            1. 先解析 URL 查询参数 → req.query 立即可用
            2. 再解析请求体 → req.body 在文件处理后才可用
            3. 最后处理文件 → req.file 最后可用       

        // multer 处理请求的顺序：
            1. 解析 URL 查询参数 (req.query) 
            2. 调用 storage 的回调函数（destination 和 filename）
            3. 处理文件上传
            4. 解析请求体 (req.body) 不可以用， 最后才可用
        filename: 该处也需要使用query 获取 fileId 和 chunkIndex，此时 req.body 还未解析
        destination 和 filename 回调时机：
            1.
        完整的请求处理流程：
            客户端请求
                ↓
                Express 接收请求
                ↓
                解析 URL 查询参数 (req.query) ← 第一个可用
                ↓
                Express 内置中间件 (express.json(), express.urlencoded())
                ↓
                Multer 中间件开始处理
                ├── 1. 解析 multipart/form-data
                ├── 2. 调用 storage.destination 回调
                ├── 3. 调用 storage.filename 回调
                ├── 4. 保存文件到磁盘
                └── 5. 解析其他表单字段 (req.body) ← 第二个可用
                ↓
                文件信息挂载到 req.file ← 最后可用
                ↓
                进入业务处理中间件
        2. body不可用的原因：
        文件处理在 body 解析前，multipart/form-data 格式包含文件和表单字段


        解决方案： 
            1.用 req.query 或 req.headers 传递分片信息：
                前端上传分片时，把 fileId、chunkIndex、uploadType 放到 URL 查询参数或 header
            2.用 multer 的 fields 方式，确保字段顺序：
                坚持用 FormData，但确保 file 字段在最后 append，这样 multer 先解析 form 字段再处理文件字段。但最保险的还是用 URL 查询参数或 header
            任何请求方法都可以有查询参数

            请求头的作用：
                诉服务器请求的元信息：
                Content-Type: application/json     # 告诉服务器请求体的格式
                Content-Length: 123                # 告诉服务器请求体的大小
                Accept: application/json           # 告诉服务器期望的响应格式
                User-Agent: Mozilla/5.0...        # 告诉服务器客户端信息  
                身份认证和授权         
                Authorization: Bearer token123     # 身份认证
                Cookie: sessionId=abc123          # 会话信息
                X-API-Key: your-api-key          # API 密钥
                控制请求行为:
                Cache-Control: no-cache           # 控制缓存行为
                Connection: keep-alive           # 控制连接方式
                Accept-Encoding: gzip, deflate   # 支持的压缩格式   
                传递业务参数:                 
                X-Request-ID: uuid123            # 请求追踪
                X-Client-Version: 1.0.0          # 客户端版本
                    X-Platform: web                  # 平台信息
7.28：
    文件上传组件的成功回调函数的文件数据依赖于set数据更新，而其是异步的，无法及时获取到值
    解决：让上传函数返回成功的结果，而不是依赖状态更新
微信文件消息方案：
    客户端处理阶段：
    用户选择文件后，客户端首先进行文件验证（大小、类型、安全性）
    计算文件的MD5哈希值，用于后续的秒传判断
    如果是图片或视频，会生成缩略图用于消息预览
    将文件分片上传到CDN或云存储服务器

    服务器处理阶段：
    接收文件分片，进行完整性校验
    合并文件分片，生成最终文件
    将文件存储到分布式存储系统（如阿里云OSS、腾讯云COS）
    生成文件的访问URL，用于后续下载

    消息发送机制
    文件上传成功后，客户端构建文件消息对象
    消息包含文件的基本信息（名称、大小、类型、URL、MD5等）
    消息状态初始化为"发送中"

webRTC：
    连接状态：
    {
        signalingState: "stable" | "have-local-offer" | "have-remote-offer" | "closed",
        iceGatheringState: "new" | "gathering" | "complete",
        iceConnectionState: "new" | "checking" | "connected" | "completed" | "disconnected",
        connectionState: "new" | "connecting" | "connected" | "disconnected" | "failed"
    }

    bug分析：
        1.信令处理错误：在 useVoiceCall.ts 的 handleCallAccept 函数中存在一个致命的早退逻辑
            导致发起方永远无法处理对方发来的Answer，WebRTC连接无法完成SDP协商，通话建立失败
        2. 不标准的WebRTC实现
            使用了已废弃的 offerToReceiveAudio/Video 约束
            缺少防御性的 ensurePeer() 机制
            对WebRTC状态变化的理解和处理不准确
        3. 重复事件处理问题
            服务端ICE候选转发给双方（包括发送方），造成重复处理
            缺少有效的重复事件防护机制
            ICE候选回调中存在闭包问题，导致callId获取不准确
        4. 过于激进的连接管理
            disconnected 状态立即触发清理，不给浏览器自动重连机会
            缺少详细的状态监控和错误诊断
        5. ICE候选处理时机
            setLocalDescription 后开始ICE收集
            ICE候选通过 onicecandidate 事件异步生成
            需要通过信令通道发送给对端
            对端通过 addIceCandidate 添加候选

    WebRTC通话全流程总结：
        
        通话发起
        ┌─────────────────────────────────────────────────────────────────┐
        │ 1. 用户点击通话按钮                                              │
        │    ↓                                                            │
        │ 2. 执行 initiateCall(targetUser)                                │
        │    ├── 生成唯一通话ID: call_${callerId}_${targetId}_${timestamp} │
        │    ├── 更新Redux状态: startCall()                               │
        │    └── 重置WebRTC状态: webrtcRef.current.reset()               │
        │    ↓                                                            │
        │ 3. 获取本地音频流                                                │
        │    ├── webrtcRef.current.getUserMedia()                        │
        │    ├── 请求麦克风权限                                            │
        │    ├── 配置音频参数(回声消除、降噪等)                            │
        │    └── dispatch(setLocalStream(stream))                        │
        │    ↓                                                            │
        │ 4. 创建Offer SDP                                                │
        │    ├── webrtcRef.current.createOffer()                         │
        │    ├── 添加本地音频轨道到PeerConnection                          │
        │    ├── 调用 peerConnection.createOffer() (标准方式)             │
        │    ├── 调用 peerConnection.setLocalDescription(offer)           │
        │    ├── 触发ICE候选收集 (iceGatheringState: new → gathering)      │
        │    └── 信令状态变为: have-local-offer                            │
        │    ↓                                                            │
        │ 5. 发送通话邀请                                                  │
        │    ├── socket.emit('call:start', {callId, from, to, offer})     │
        │    └── 等待对方接受                                              │
        └─────────────────────────────────────────────────────────────────┘
        
        信令转发 
        ┌─────────────────────────────────────────────────────────────────┐
        │ 6. 服务端接收call:start事件                                      │
        │    ├── 解析通话信息(callId, from, to, offer)                     │
        │    ├── 记录Offer SDP长度用于调试                                 │
        │    └── 转发给目标用户: io.to(targetUserId).emit('call:start')    │
        └─────────────────────────────────────────────────────────────────┘
        
        接收通话邀请 
        ┌─────────────────────────────────────────────────────────────────┐
        │ 7. 接收方收到call:start事件                                      │
        │    ├── 执行 handleCallStart(event)                              │
        │    ├── 验证用户登录状态                                          │
        │    ├── 更新Redux状态: receiveCall({callId, localUser, remoteUser, offer}) │
        │    ├── 保存Offer到 callState.pendingOffer                       │
        │    ├── 显示通话邀请UI                                            │
        │    └── 等待用户决定(接受/拒绝)                                    │
        └─────────────────────────────────────────────────────────────────┘
        
        接受通话
        ┌─────────────────────────────────────────────────────────────────┐
        │ 8. 用户点击接受按钮                                              │
        │    ↓                                                            │
        │ 9. 执行 acceptCall()                                             │
        │    ├── 重置WebRTC状态: webrtcRef.current.reset()               │
        │    ├── 获取本地音频流: getUserMedia()                            │
        │    └── 请求麦克风权限                                            │
        │    ↓                                                            │
        │ 10. 处理Offer并创建Answer                                        │
        │     ├── webrtcRef.current.handleOffer(pendingOffer)             │
        │     ├── peerConnection.setRemoteDescription(offer)              │
        │     ├── 信令状态变为: have-remote-offer                          │
        │     ├── 添加本地音频轨道                                         │
        │     ├── peerConnection.createAnswer()                           │
        │     ├── peerConnection.setLocalDescription(answer)              │
        │     ├── 信令状态变为: stable                                     │
        │     ├── 触发ICE候选收集                                          │
        │     └── 处理暂存的ICE候选                                        │
        │     ↓                                                           │
        │ 11. 发送Answer                                                   │
        │     ├── 防重复发送检查                                           │
        │     ├── socket.emit('call:accept', {callId, from, to, answer})   │
        │     └── 等待连接建立                                             │
        └─────────────────────────────────────────────────────────────────┘
        
        Answer处理
        ┌─────────────────────────────────────────────────────────────────┐
        │ 12. 发起方收到call:accept事件                                    │
        │     ├── 执行 handleCallAccept(event)                            │
        │     ├── 重复事件检查(processedEvents防护)                        │
        │     ├── WebRTC状态检查(stable状态跳过)                           │
        │     └── 验证callId匹配                                           │
        │     ↓                                                           │
        │ 13. 处理Answer SDP                                               │
        │     ├── webrtcRef.current.handleAnswer(answer)                  │
        │     ├── 验证信令状态(期望: have-local-offer)                     │
        │     ├── peerConnection.setRemoteDescription(answer)             │
        │     ├── 信令状态变为: stable                                     │
        │     ├── 处理暂存的ICE候选                                        │
        │     └── SDP协商完成                                              │
        └─────────────────────────────────────────────────────────────────┘
        
        ICE连接建立
        ┌─────────────────────────────────────────────────────────────────┐
        │ 14. ICE候选收集与交换                                            │
        │     ├── 双方PeerConnection开始ICE收集                           │
        │     ├── iceGatheringState: new → gathering → complete           │
        │     ├── 生成各种类型候选(host/srflx/relay)                       │
        │     ├── 通过onicecandidate事件获取候选                           │
        │     ├── socket.emit('call:ice', {callId, candidate})             │
        │     ├── 服务端转发: socket.to().emit('call:ice')                │
        │     ├── 对方接收: handleCallIce() → addIceCandidate()           │
        │     └── ICE连接状态变化: new → checking → connected              │
        │     ↓                                                           │
        │ 15. 连接状态监控                                                 │
        │     ├── oniceconnectionstatechange事件                          │
        │     ├── onconnectionstatechange事件                             │
        │     ├── connectionState: new → connecting → connected           │
        │     └── 详细状态日志记录                                         │
        └─────────────────────────────────────────────────────────────────┘
        
        媒体流建立
        ┌─────────────────────────────────────────────────────────────────┐
        │ 16. 远程媒体流接收                                               │
        │     ├── ontrack事件触发                                          │
        │     ├── 获取远程音频流: event.streams[0]                         │
        │     ├── dispatch(setRemoteStream(remoteStream))                  │
        │     ├── 绑定到HTML audio元素                                     │
        │     └── 自动播放远程音频                                         │
        │     ↓                                                           │
        │ 17. 连接成功确认                                                 │
        │     ├── connectionState变为'connected'                          │
        │     ├── dispatch(connectCall())                                  │
        │     ├── 启动通话计时器                                           │
        │     ├── 显示"通话连接成功"                                       │
        │     └── UI切换到通话中状态                                       │
        └─────────────────────────────────────────────────────────────────┘
        
        通话进行中
        ┌─────────────────────────────────────────────────────────────────┐
        │ 18. 通话功能                                                     │
        │     ├── 实时音频传输                                             │
        │     ├── 静音/取消静音: toggleMute()                              │
        │     ├── 通话时长计时                                             │
        │     ├── 连接质量监控                                             │
        │     └── 网络状态监控                                             │
        │     ↓                                                           │
        │ 19. 错误处理与恢复                                               │
        │     ├── ICE连接断开自动重连                                      │
        │     ├── 网络波动处理                                             │
        │     ├── 连接失败时清理资源                                       │
        │     └── 用户友好的错误提示                                       │
        └─────────────────────────────────────────────────────────────────┘
        
        通话结束
        ┌─────────────────────────────────────────────────────────────────┐
        │ 20. 结束通话                                                     │
        │     ├── 用户点击挂断: terminateCall()                           │
        │     ├── socket.emit('call:end', {callId})                       │
        │     ├── 服务端广播给双方                                         │
        │     ├── 执行cleanup()清理资源                                    │
        │     ├── 停止所有媒体轨道                                         │
        │     ├── 关闭PeerConnection                                       │
        │     ├── 清理定时器和事件监听                                     │
        │     ├── 重置Redux状态                                            │
        │     └── 显示通话结束界面                                         │
        └─────────────────────────────────────────────────────────────────┘
        
        ═══════════════════════════════════════════════════════════════════
        要点
        ═══════════════════════════════════════════════════════════════════
        
        【信令协商流程】
        Caller: createOffer() → setLocalDescription(offer) → 发送Offer
        Callee: setRemoteDescription(offer) → createAnswer() → setLocalDescription(answer) → 发送Answer
        Caller: setRemoteDescription(answer) → 连接建立
        
        【ICE连接流程】
        1. setLocalDescription触发ICE收集
        2. onicecandidate事件异步生成候选
        3. 通过信令通道交换候选
        4. addIceCandidate添加对端候选
        5. ICE连接状态: new → checking → connected
        
        【状态变化时序】
        信令状态: stable → have-local-offer → stable
        ICE收集: new → gathering → complete  
        ICE连接: new → checking → connected
        整体连接: new → connecting → connected
        
        【防护机制】
        ✅ 重复事件防护(processedEvents)
        ✅ 重复发送防护(acceptSentRef)  
        ✅ WebRTC状态检查(stable跳过)
        ✅ 连接实例防护(ensurePeer)
        ✅ 闭包问题解决(currentCallIdRef)
        
        【错误处理】
        ✅ 网络连接失败自动清理
        ✅ ICE候选错误监控
        ✅ 媒体权限错误处理
        ✅ 信令状态异常处理
        ✅ 详细调试日志记录

