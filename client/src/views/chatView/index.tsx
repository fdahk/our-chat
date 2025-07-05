import { useState, useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { type RootState } from '../../store/user';
import { getConversationList } from './api';
import type { Conversation, Message } from './type';
import { Input, Button, List, message as antdMessage } from 'antd';
import chatViewStyle from './index.module.scss';
import SocketService from '../../utils/socket';

function ChatView() {
    const [chatList, setChatList] = useState<Conversation[]>([]); // 会话列表
    const [activeConv, setActiveConv] = useState<Conversation | null>(null); // 当前会话
    const [messages, setMessages] = useState<Message[]>([]); // 消息列表
    const [input, setInput] = useState(''); // 输入框内容
    const userId = useSelector((state: RootState) => state.user.id); // 用户id
    const socket = SocketService.getInstance(); // socket实例
    
    // 获取会话列表
    useEffect(() => {
        getConversationList(userId as number).then((data) => {
            setChatList(data as Conversation[]);
        });
    }, [userId]);

    // 监听 socket 消息
    useEffect(() => {
        if (!activeConv) return;
        // 1加入房间
        socket.emit('join', { convId: activeConv.id });

        const handleMessage = (msg: Message) => {
            if (msg.conversationId === activeConv.id) {
                setMessages((prev) => [...prev, msg]);
            }
        };

        socket.on('receiveMessage', handleMessage);

        return () => {
            //  离开房间
            socket.emit('leave', { convId: activeConv.id });
            socket.off('receiveMessage', handleMessage);
        };
    }, [activeConv]);

    // 发送消息
    const sendMessage = () => {
        if (!input.trim() || !activeConv) return;
        console.log('activeConv', activeConv);
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
        // setMessages((prev) => [...prev, { ...msg, self: true } as Message]); // 由socket监听receiveMessage事件来更新消息列表
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
                                setMessages([]); // 切换会话时清空消息（可改为请求历史消息）
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
                                dataSource={messages}
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