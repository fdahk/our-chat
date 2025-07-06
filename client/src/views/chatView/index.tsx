import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { type UserState } from '../../store/userStore';
import { type ChatState } from '../../store/chatStore';
import { getConversationList } from './api';
import type { Conversation, ConvMessage } from '../../globalType/conversation';
import { Input, Button, List } from 'antd';
import chatViewStyle from './index.module.scss';
import SocketService from '../../utils/socket';
import type { ApiResponse } from '../../globalType/apiResponse';


function ChatView() {
    const [chatList, setChatList] = useState<Conversation[]>([]); // 会话列表
    const [activeConv, setActiveConv] = useState<Conversation | null>(null); // 当前会话id
    const [messages, setMessages] = useState<ConvMessage>({}); //消息列表 注：数据结构为 { [conversationId: string]: Message[] , ... }
    const [input, setInput] = useState(''); // 输入框内容
    const userId = useSelector((state: UserState) => state.id); // 从redux中获取用户id
    const globalMessages = useSelector((state: ChatState) => state.globalMessages); // 从redux中获取全局消息
    const socket = SocketService.getInstance(); // 获取socket实例
    // 登录时获取后端最新的会话列表和全局消息
    useEffect(() => {
        // Promise 链式调用，比传统async/await更简洁，回调函数更是古代的写法
        getConversationList(userId as number).then((res: ApiResponse<Conversation[]>) => {
            setChatList(res.data ?? []);
        });
        
    }, [userId]);

    // 监听redux状态全局消息，更新消息列表
    useEffect(() => {
        setMessages(globalMessages); // 注：globalMessages是redux状态，是全局消息，数据结构与messages一致，直接赋值即可
    }, [ globalMessages]);

    // 发送消息
    const sendMessage = () => {
        if (!input.trim() || !activeConv) return;
        console.log('activeConv', activeConv); // 调试
        const msg = {
            conversationId: activeConv.id,
            senderId: String(userId), //userId是number类型，需要转换为string类型
            content: input,
            type: 'text',
            status: 'sent',
            mentions: [],
            isEdited: false,
            isDeleted: false,
            extra: {
                timestamp: new Date().toISOString(),
            },
            editHistory: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        socket.emit('sendMessage', msg);
        // setMessages((prev) => [...prev, { ...msg, self: true } as Message]); // 由socket监听receiveMessage事件来更新消息列表，这里不更新
        setInput('');
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
                                // setMessages([]); // 切换会话时清空消息（可改为请求历史消息）
                            }}
                        >
                            <div className={chatViewStyle.item_avatar}>
                                <img src={item.avatar || ''} alt="" />
                            </div>
                            <div className={chatViewStyle.item_title}>{item.title}</div>
                        </div>
                    ))}
                </div>
            </div>
            {/* 右侧：聊天窗口 */}
            <div className={chatViewStyle.chat_view_right}>
                {activeConv ? (
                    <>
                        <div className={chatViewStyle.chat_header}>{activeConv.title}</div> {/* 会话标题 */}
                        {/* 消息列表 */}
                        <div className={chatViewStyle.chat_body}>
                            <List
                                className={chatViewStyle.message_list}
                                dataSource={messages[activeConv.id]}
                                renderItem={(msg) => (
                                    <List.Item className={msg.senderId === String(userId) ? chatViewStyle.self_msg : chatViewStyle.other_msg}>
                                        <div className={chatViewStyle.message_content}>{msg.content}</div>
                                    </List.Item>
                                )}
                            />
                        </div>
                        {/* 输入框 */}
                        <div className={chatViewStyle.input_area}>
                            <Input.TextArea
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onPressEnter={e => { e.preventDefault(); sendMessage(); }}
                                rows={2}
                                placeholder="请输入消息"
                                className={chatViewStyle.input_textarea}
                            />
                            <Button type="primary" onClick={sendMessage} className={chatViewStyle.send_button}>
                                发送
                            </Button>
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