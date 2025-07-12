import { useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { Conversation } from '@/globalType/chat';
import type { Message } from '@/globalType/message';
import { Input, Button, List } from 'antd';
import chatViewStyle from './index.module.scss';
import SocketService from '@/utils/socket';
import { getConversationMessages } from '@/globalApi/chatApi';
import { initGlobalMessages, setActiveConversation } from '@/store/chatStore';
import type { ApiResponse } from '@/globalType/apiResponse';
import type { RootState } from '@/store/rootStore';

function ChatView() {

    const dispatch = useDispatch();
    const activeConversation = useSelector((state: RootState) => state.chat.activeConversation); // 当前会话id
    const messages = useSelector((state: RootState) => state.chat.globalMessages); //消息列表 注：数据结构为 { [conversationId: string]: Message[] , ... }
    const [input, setInput] = useState(''); // 输入框内容
    const userId= useSelector((state: RootState) => state.user.id) as number; // 从redux中获取用户id
    // 注： RootState 类型是通过 ReturnType<typeof rootStore.getState> 推导出来的。
    // 但 redux-persist 的 persistReducer 会在 state 外层加上一些持久化相关的属性（如 _persist），
    // 导致类型变成 PersistPartial<RootState>，类型推断不再直接有 chat 属性(实际上能获取正确值，但类型推断报错)
    // 以下使用any类型，避免类型推断报错，但并非最佳实践
    const globalMessages = useSelector((state: RootState) => state.chat.globalMessages); // 从redux中获取全局消息
    const globalUserConversations = useSelector((state: RootState) => state.chat.globalUserConversations); // 从redux中获取全局用户会话列表
    const globalConversations = useSelector((state: RootState) => state.chat.globalConversations); // 从redux中获取全局会话列表
    const globalFriendList = useSelector((state: RootState) => state.chat.globalFriendList); // 从redux中获取全局好友列表
    const globalFriendInfoList = useSelector((state: RootState) => state.chat.globalFriendInfoList); // 从redux中获取全局好友信息列表
    const socket = SocketService.getInstance(); // 获取socket实例
    const chatBodyRef = useRef<HTMLDivElement>(null); // 消息列表的ref，用来实现滚动
    // const inputRef = useRef<HTMLTextAreaElement>(null); // 输入框的ref，用来实现滚动，注：antd组件已实现
    // 从localStorage（应用启动时已从后端中获取最新的会话列表和全局消息存到本地）中获取
    // useEffect(() => {
    //     //注：有上下级关系的数据，只监听上级，不能直接传入数组（可以传入引用、字段
    //     //如果 arr 是一个“每次渲染都新建的数组”，每次渲染都会生成新数组，会报错
    //     //引用：如果 arr 是 useState/useMemo/useCallback 得到的，引用只有在内容真正变化时才变：
    //     //总结：传入arr时需要保证是引用稳定的，否则会报错
    //     dispatch(setActiveConversation(null));
    // }, []); 

    // 获取会话消息（懒加载）
    const handleClickConversation = async (conversationId: string) => {
        await getConversationMessages(conversationId).then((res: ApiResponse<Message[]>) => {
            // dispatch(initGlobalMessages(res.data ?? {})); // 注： 数据结构为 { [conversationId: string]: Message[] , ... }
            dispatch(initGlobalMessages(res.data ?? []));
        });
    };
    // 解析会话id，获取好友id
    const parseConversationId = (conversationId: string) => {
        const tp = conversationId.split('_');
        return parseInt(tp[1]===userId?.toString() ? tp[2] : tp[1]);
    };

    // 消息列表滚动条始终在底部
    useEffect(() => {
        // 注： ref不要绑定错了、一定要if判断存在，不然dom没渲染完成也会执行
        if (chatBodyRef.current) {
            // scrollTop：当前滚动条距离顶部的像素值（可读可写）
            // scrollHeight：内容总高度（只读）
            // clientHeight：可视区域高度（只读）
            chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
        }
    }, [messages, activeConversation]);

    // 发送消息
    const sendMessage = () => {
        if (!input.trim() || !activeConversation) return;
        // console.log('activeConv', activeConv); // 调试
        const msg:Message = {
            conversationId: activeConversation,
            senderId: userId, //userId是number类型，需要转换为string类型
            content: input,
            type: 'text',
            status: 'sent',
            mentions: [],
            isEdited: false,
            isDeleted: false,
            extra: {},
            editHistory: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            timestamp: new Date().toISOString(),
        };
        socket.emit('sendMessage', msg);
        // setMessages((prev) => [...prev, { ...msg, self: true } as Message]); // 由socket监听receiveMessage事件来更新消息列表，这里不更新
        setInput('');
    };
    // 处理键盘事件
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
        else if (e.key === 'Enter' && e.shiftKey) {
            e.preventDefault();
            setInput(prev => prev + '\n');
        }
    };

    return (
        <div className={chatViewStyle.chat_view_container}>
            {/* 左侧：对话列表 */}
            <div className={chatViewStyle.chat_view_left}>
                <div className={chatViewStyle.chat_view_left_header}>header</div>
                <div className={chatViewStyle.chat_view_left_body}>
                        {globalConversations.map((item: Conversation) => (
                        <div
                            key={item.id}
                            className={`${chatViewStyle.chat_view_left_body_item} ${activeConversation === item.id 
                                ? chatViewStyle.active : ''}`}
                            onClick={() => {
                                dispatch(setActiveConversation(item.id));
                                handleClickConversation(item.id);
                            }}
                        >
                            <div className={chatViewStyle.item_avatar}>
                                <img src={globalFriendInfoList[parseConversationId(item.id)]?.avatar 
                                    ? `http://localhost:3007${globalFriendInfoList[parseConversationId(item.id)]?.avatar}` 
                                    : 'src/assets/images/defaultAvatar.jpg'} alt="" />
                            </div>
                            <div className={chatViewStyle.item_title}>{globalFriendInfoList[parseConversationId(item.id)]?.username || ''}</div>
                        </div>
                    ))}
                </div>
            </div>
            {/* 右侧：聊天窗口 */}
            <div className={chatViewStyle.chat_view_right}>
                {activeConversation ? (
                    <>
                        <div className={chatViewStyle.chat_header}>{globalFriendInfoList[parseConversationId(activeConversation)]?.username || ''}</div> {/* 会话标题 */}
                        {/* 消息列表 */}
                        <div className={chatViewStyle.chat_body} ref={chatBodyRef}>
                            <List
                                className={chatViewStyle.message_list}
                                dataSource={messages}
                                renderItem={(msg: Message) =>{ 
                                    return (
                                    <List.Item className={msg.senderId === userId ? chatViewStyle.self_msg : chatViewStyle.other_msg}>
                                        <div className={chatViewStyle.message_content}>{msg.content}</div>
                                    </List.Item>
                                )}}
                            />
                        </div>
                        {/* 输入框 */}
                        <div className={chatViewStyle.input_area_container}>
                            <div className={chatViewStyle.input_area_box}>
                                <Input.TextArea
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    autoSize={{ minRows: 2, maxRows: 4 }}
                                    placeholder="请输入消息"
                                    className={chatViewStyle.input_textarea}
                                />
                                <Button type="primary" onClick={sendMessage} className={chatViewStyle.send_button}>
                                    发送
                                </Button>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className={chatViewStyle.no_chat}>请选择一个会话</div>
                )}
            </div>
        </div>
    );
}

export default ChatView;