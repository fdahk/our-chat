文本对话：
1.只拉取会话列表，不拉取消息，点开会话时再拉取该会话的消息（懒加载）
2. 对于每个会话，只拉取每个会话最新的一条消息，点开会话时再拉取历史消息
    会话列表接口返回每个会话的最新一条消息（用于预览），点开会话时再分页拉取历史消息。

方案总结：（主流 IM/微信/QQ 方案）
    会话列表接口：只返回会话基本信息+最新一条消息（用于预览）
    会话消息接口：点开会话时，分页拉取该会话的消息
    历史消息：用户上拉时再分页加载更多历史消息
    新消息推送：通过 WebSocket/轮询等方式实时推送新消息
    注：user_conversation中以conversation作为外键
消息收发逻辑:
    1.应用首次启动时从数据库拉取数据，此后的新增的任何数据都在本地更新 
    2.socket负责所有新消息的分发


会话管理逻辑：
    1.私聊会话id：single_1_2 始终谁小谁在前
        优点：避免同一会话消息割裂导致获取困难、同步困难，
        在添加好友时，自动创建首次会话记录，单向删除消息仅可删除“用户会话记录“，不可删除会话记录，实现会话的单向管理
        双方均删除好友时，彻底清空数据库的有关记录（会话、好友、消息等） 

好友添加逻辑：
  后端添加请求记录，前端添加redux，socket传递请求状态
  对方同意后，系统需自动发送“打招呼”来创建对话，此时由于好友状态未更新，需要在监听器创建会话的地方判断一下，更新最新的好友状态
    
3.对于项目中的请求拦截器和响应拦截器：

7.24：
  添加好友后发起首次消息，存在外键问题： 在回复请求的后端api处直接添加会话记录
7.26：
  // 去除antD自带样式
  :global(.ant-input-outlined:focus),
  :global(.ant-input-outlined:focus-within) {
    border-color: transparent !important;
    box-shadow: none !important;
    outline: none !important;
    background-color: transparent !important;
  }

8.2：
    语音通话功能
    注意事项：
        必须遵循 标准WebRTC协商流程：offer/answer在邀请阶段就开始
        简化Socket事件：只有4个核心事件

