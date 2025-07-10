import { useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { Conversation } from '@/globalType/conversation';
import type { Message } from '@/globalType/message';
import { Input, Button, List } from 'antd';
import chatViewStyle from './index.module.scss';
import SocketService from '@/utils/socket';
import { getFriendList } from '@/globalApi/friendApi';
import { getConversationMessages } from '@/globalApi/chatApi';
import { initGlobalMessages } from '@/store/chatStore';
import type { ApiResponse } from '@/globalType/apiResponse';

function ChatView() {
    const dispatch = useDispatch();
    const [chatList, setChatList] = useState<Conversation[]>([]); // 会话列表 注：数据结构为 [{}, ...]
    const [activeConv, setActiveConv] = useState<Conversation | null>(null); // 当前会话id
    // const [messages, setMessages] = useState<ConvMessage>({}); //消息列表 注：数据结构为 { [conversationId: string]: Message[] , ... }
    const [messages, setMessages] = useState<Message[]>([]); //消息列表 注：数据结构为 { [conversationId: string]: Message[] , ... }
    const [input, setInput] = useState(''); // 输入框内容
    const [friendList, setFriendList] = useState<{ friend_id: number, remark: string | null }[]>([]); // 所有对话涉及的好友id
    const [friendInfo, setFriendInfo] = useState<{ [key: number]: { username: string, avatar: string, gender: string } }>({}); // 所有对话涉及的好友信息
    // const userId = useSelector((state: UserState) => state.id); // 从redux中获取用户id
    const user = JSON.parse(localStorage.getItem('persist:user') as string);
    const userId: number = parseInt(user.id); // 注：一层转换后还是string，再转换一次变成Number类型
    // 注： RootState 类型是通过 ReturnType<typeof rootStore.getState> 推导出来的。
    // 但 redux-persist 的 persistReducer 会在 state 外层加上一些持久化相关的属性（如 _persist），
    // 导致类型变成 PersistPartial<RootState>，类型推断不再直接有 chat 属性(实际上能获取正确值，但类型推断报错)
    // 以下使用any类型，避免类型推断报错，但并非最佳实践
    const globalMessages = useSelector((state: any) => state.chat.globalMessages); // 从redux中获取全局消息
    const globalConversations = useSelector((state: any) => state.chat.globalConversations); // 从redux中获取全局会话列表
    const socket = SocketService.getInstance(); // 获取socket实例
    const chatBodyRef = useRef<HTMLDivElement>(null); // 消息列表的ref，用来实现滚动
    // const inputRef = useRef<HTMLTextAreaElement>(null); // 输入框的ref，用来实现滚动，注：antd组件已实现
    // 从localStorage（应用启动时已从后端中获取最新的会话列表和全局消息存到本地）中获取
    useEffect(() => {
        // 错误写法：
        // setChatList(JSON.parse(localStorage.getItem('persist:chat') as string).globalConversations);
        // setMessages(JSON.parse(localStorage.getItem('persist:chat') as string).globalMessages);
        // 注：redux-persist 存到 localStorage 里的是“对象的每个字段都被 JSON.stringify 过的字符串”。
        // 你需要两次 parse：先 parse 整体，再 parse字段。
        // 注：由于数据储存及更新方式为store到local，该操作是异步的，无法及时更新local，应当使用store的数据
        // 由于store持久化配置，页面刷新时，store数据会自动恢复，所以不需要再从local获取数据
        // const persistChat = JSON.parse(localStorage.getItem('persist:chat') as string);
        // const localGlobalConversations = JSON.parse(persistChat.globalConversations);
        // const localGlobalMessages = JSON.parse(persistChat.globalMessages);
        //  console.log("chatView组件更新") // 调试
        setMessages(globalMessages); //及时更新消息
        setChatList(globalConversations);
        // setMessages(globalMessages);
        // 获取涉及的用户信息
        getFriendList(user.id).then(res => {
            setFriendList(res.data.friendId); //返回好友id
            setFriendInfo(res.data.friendInfo); //返回好友信息
        });
            
    }, [globalMessages, globalConversations]);
    // console.log(messages) // 调试
    // console.log(globalMessages) // 调试

    // 获取会话消息（懒加载）
    const handleClickConversation = async (conversationId: string) => {
        await getConversationMessages(conversationId).then((res: ApiResponse<Message[]>) => {
            // dispatch(initGlobalMessages(res.data ?? {})); // 注： 数据结构为 { [conversationId: string]: Message[] , ... }
            dispatch(initGlobalMessages(res.data ?? []));
            setMessages(res.data ?? []);
        });
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
    }, [messages, activeConv]);

    // 发送消息
    const sendMessage = () => {
        if (!input.trim() || !activeConv) return;
        // console.log('activeConv', activeConv); // 调试
        const msg:Message = {
            conversationId: activeConv.conversation_id,
            senderId: activeConv.user_id, //userId是number类型，需要转换为string类型
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
                    {chatList.map((item) => (
                        <div
                            key={item.id}
                            className={`${chatViewStyle.chat_view_left_body_item} ${activeConv?.id === item.id ? chatViewStyle.active : ''}`}
                            onClick={() => {
                                setActiveConv(item);
                                handleClickConversation(item.conversation_id);
                            }}
                        >
                            <div className={chatViewStyle.item_avatar}>
                                <img src={friendInfo[item.user_id]?.avatar 
                                    ? `http://localhost:3007${friendInfo[item.user_id]?.avatar}` 
                                    : 'src/assets/images/defaultAvatar.jpg'} alt="" />
                            </div>
                            <div className={chatViewStyle.item_title}>{friendInfo[item.user_id]?.username || ''}</div>
                        </div>
                    ))}
                </div>
            </div>
            {/* 右侧：聊天窗口 */}
            <div className={chatViewStyle.chat_view_right}>
                {activeConv ? (
                    <>
                        <div className={chatViewStyle.chat_header}>{friendInfo[activeConv.user_id]?.username || ''}</div> {/* 会话标题 */}
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