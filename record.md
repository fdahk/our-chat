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
        // multer 的解析顺序：
            1. 先解析 URL 查询参数 → req.query 立即可用
            2. 再解析请求体 → req.body 在文件处理后才可用
            3. 最后处理文件 → req.file 最后可用       

            // multer 处理请求的顺序：
1. 解析 URL 查询参数 (req.query) ✅ 最先可用
2. 调用 storage 的回调函数（destination 和 filename）
3. 处理文件上传
4. 解析请求体 (req.body) ❌ 最后才可用
        destination 和 filename 回调时机：
            1.
        
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