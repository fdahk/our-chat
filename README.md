文本对话业务：
A: 只拉取会话列表，不拉取消息，点开会话时再拉取该会话的消息（懒加载）
    缺点：首次点开某个会话时有短暂加载延迟。
B. 只拉取每个会话最新的一条消息，点开会话时再拉取历史消息
    会话列表接口返回每个会话的最新一条消息（用于预览），点开会话时再分页拉取历史消息。
    优点：首屏快，能展示最新消息预览，体验好。
    缺点：实现稍复杂，需要分页/懒加载。
方案总结：（主流 IM/微信/QQ 都是这样做的）
    会话列表接口：只返回会话基本信息+最新一条消息（用于预览）
    会话消息接口：点开会话时，分页拉取该会话的消息
    历史消息：用户上拉时再分页加载更多历史消息
    新消息推送：通过 WebSocket/轮询等方式实时推送新消息

核心逻辑:
    1.应用启动时从数据库拉取数据，此后的新增的任何数据都再redux本地更新不再拉取
    2.私聊会话id：single_1_2 始终谁小谁在前,避免会话消息割裂导致获取困难、同步困难
      在添加好友时，首次创建记录，单向删除消息仅可删除用户会话记录，不可删除会话记录，
      双方均删除好友时，彻底清空数据库的记录
