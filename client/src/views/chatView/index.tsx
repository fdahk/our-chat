import { useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import type { Conversation } from '@/globalType/chat';
import type { Message } from '@/globalType/message';
import { Input, Button, List } from 'antd';
import chatViewStyle from './style.module.scss';
import SocketService from '@/utils/socket';
import { getConversationMessages } from '@/globalApi/chatApi';
import { initGlobalMessages, initActiveConversation } from '@/store/chatStore';
import type { ApiResponse } from '@/globalType/apiResponse';
import type { RootState } from '@/store/rootStore';
import DisplayItem from '@/globalComponents/displayItem';
import SearchModal from '@/globalComponents/searchModal';
import FileUploader from '@/globalComponents/fileUploader';
import { useVoiceCall } from '@/hooks/useVoiceCall';
import type { CallUser } from '@/globalType/call';
function ChatView() {

    const dispatch = useDispatch();
    const activeConversation = useSelector((state: RootState) => state.chat.activeConversation); // 当前会话id
    const messages = useSelector((state: RootState) => state.chat.globalMessages); //消息列表 注：数据结构为 { [conversationId: string]: Message[] , ... }
    const [input, setInput] = useState(''); // 输入框内容
    const userId= useSelector((state: RootState) => state.user.id) as number; // 从redux中获取用户id
    const inputAreaIcons = [
        {label: '表情', icon: "icon-meh", method: "handleClickEmoji"},
        {label: '文件', icon: "icon-folder", method: "handleClickFile"},
        {label: '截图', icon: "icon-scissor", method: "handleClickScreenshot"},
        {label: '聊天记录', icon: "icon-comment", method: "handleClickChatRecord"},
       {label: '语音聊天', icon: "icon-phone", method: "handleClickVoice"},        
        {label: '视频聊天', icon: "icon-videocameraadd", method: "handleClickVideo"},
    ]
    // 注： RootState 类型是通过 ReturnType<typeof rootStore.getState> 推导出来的。
    // 但 redux-persist 的 persistReducer 会在 state 外层加上一些持久化相关的属性（如 _persist），
    // 导致类型变成 PersistPartial<RootState>，类型推断不再直接有 chat 属性(实际上能获取正确值，但类型推断报错)
    // 以下使用any类型，避免类型推断报错，但并非最佳实践
    const globalConversations = useSelector((state: RootState) => state.chat.globalConversations); // 从redux中获取全局会话列表
    const globalFriendInfoList = useSelector((state: RootState) => state.chat.globalFriendInfoList); // 从redux中获取全局好友信息列表
    const lastMessages = useSelector((state: RootState) => state.chat.lastMessages); // 从redux中获取最后一条消息
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
        dispatch(initActiveConversation(conversationId));
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
            senderId: userId,
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
    const handleSearchChange = (value: string) => {
        console.log(value);
    }
    // 按钮点击事件
    const handleClickHeaderIcon = (method: string) => {
        switch(method) {
            case 'handleClickEmoji':
                handleClickEmoji();
                break;
            case 'handleClickFile':
                handleClickFile();
                break;
            case 'handleClickScreenshot':
                handleClickScreenshot();
                break;
            case 'handleClickChatRecord':
                handleClickChatRecord();
                break;
            case 'handleClickVoice':
                handleClickVoice();
                break;
            case 'handleClickVideo':
                handleClickVideo();
                break;
        }
    }
    // 表情
    const handleClickEmoji = () => {
        console.log('handleClickEmoji');
    }
    // 文件
    const [fileUploaderVisible, setFileUploaderVisible] = useState(false);
    const handleClickFile = () => {
        setFileUploaderVisible(true);
    }
    // 文件上传成功后发送消息
    const handleFileUploadSuccess = (files: any[]) => {
        try {
            files.forEach(file => {
                const fileMessage: Message = {
                    conversationId: activeConversation!,
                    senderId: userId,
                    content: '发送了文件',
                    type: 'file',
                    status: 'sent',
                    mentions: [],
                    isEdited: false,
                    isDeleted: false,
                    extra: {},
                    fileInfo: {
                        fileName: file.originalName || file.filename,
                        fileSize: file.size,
                        fileUrl: file.url,
                        fileType: file.type || 'application/octet-stream',
                        fileMD5: file.md5
                    },
                    timestamp: new Date().toISOString(),
                    editHistory: [],
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                };
                
                // 通过socket发送文件消息
                socket.emit('sendMessage', fileMessage);
            });            
        } catch (error) {
            console.error('文件上传失败:', error);
        }
        // 关闭文件上传弹窗
        setFileUploaderVisible(false);
    };
    // 截图
    const handleClickScreenshot = () => {
        console.log('handleClickScreenshot');
    }
    // 聊天记录
    const handleClickChatRecord = () => {
        console.log('handleClickChatRecord');
    }
    // 语音聊天
    const handleClickVoice = () => {
        if (!activeConversation) {
            console.warn('没有选择聊天对象');
            return;
        }

        const friendId = parseConversationId(activeConversation);
        const friendInfo = globalFriendInfoList[friendId];
        
        if (!friendInfo) {
            console.warn('无法获取好友信息');
            return;
        }

        const targetUser: CallUser = {
            id: friendId,
            username: friendInfo.username,
            nickname: friendInfo.username,
            avatar: friendInfo.avatar 
                ? `http://localhost:3007${friendInfo.avatar}` 
                : 'src/assets/images/defaultAvatar.jpg',
        };

        initiateCall(targetUser);
    };
    // 视频聊天
    const handleClickVideo = () => {
        console.log('handleClickVideo');
    }

    // 渲染消息内容的函数
    const renderMessageContent = (msg: Message) => {
        // 文件消息
        if (msg.type === 'file' && msg.fileInfo) {
            const { fileName, fileSize, fileUrl, fileType } = msg.fileInfo;
            
            // 格式化文件大小
            const formatFileSize = (bytes: number) => {
                if (bytes === 0) return '0 Bytes';
                const k = 1024;
                const sizes = ['Bytes', 'KB', 'MB', 'GB'];
                const i = Math.floor(Math.log(bytes) / Math.log(k));
                return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
            };

            // 根据文件类型显示不同内容
            if (fileType.startsWith('image/')) {
                return (
                    <div className={chatViewStyle.file_message}>
                        <img 
                            src={`http://localhost:3007${fileUrl}`} 
                            alt={fileName}
                            style={{ maxWidth: '200px', maxHeight: '150px', borderRadius: '8px' }}
                            onClick={() => window.open(`http://localhost:3007${fileUrl}`, '_blank')}
                        />
                        <div className={chatViewStyle.file_info}>
                            <span>{fileName}</span>
                            <span>{formatFileSize(fileSize)}</span>
                        </div>
                    </div>
                );
            } else {
                return (
                    <div className={chatViewStyle.file_message}>
                        <div className={chatViewStyle.file_icon}>
                            <i className="iconfont icon-folder" style={{ fontSize: '24px' }}></i>
                        </div>
                        <div className={chatViewStyle.file_info}>
                            <div>{fileName}</div>
                            <div>{formatFileSize(fileSize)}</div>
                        </div>
                        <button 
                            onClick={() => {
                                const link = document.createElement('a');
                                link.href = `http://localhost:3007${fileUrl}`;
                                link.download = fileName;
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                            }}
                            className={chatViewStyle.download_btn}
                        >
                            下载
                        </button>
                    </div>
                );
            }
        }
        
        // 文本消息
        return <div className={chatViewStyle.message_content}>{msg.content}</div>;
    };

    const { initiateCall } = useVoiceCall(); // 添加这行

    return (
        <div className={chatViewStyle.chat_view_container}>
            {/* 左侧：对话列表 */}
            <div className={chatViewStyle.chat_view_left}>
                <SearchModal searchChange={handleSearchChange} placeholder="搜索" />
                <div className={chatViewStyle.chat_view_left_body}>
                        {Object.values(globalConversations).map((item: Conversation) => (
                            <DisplayItem
                                key={item.id}
                                id={item.id}
                                avatar={globalFriendInfoList[parseConversationId(item.id)]?.avatar 
                                    ? `http://localhost:3007${globalFriendInfoList[parseConversationId(item.id)]?.avatar}` 
                                    : 'src/assets/images/defaultAvatar.jpg'}
                                title={globalFriendInfoList[parseConversationId(item.id)]?.username}
                                content={lastMessages[item.id]?.content || ''}
                                isActive={activeConversation === item.id}
                                handleClick={handleClickConversation}
                            />
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
                                renderItem={(msg: Message) => {
                                    return (
                                        <List.Item className={msg.senderId === userId ? chatViewStyle.self_msg : chatViewStyle.other_msg}>
                                            {renderMessageContent(msg)}
                                        </List.Item>
                                    )
                                }}
                            />
                        </div>
                        {/* 输入框 */}
                        <div className={chatViewStyle.input_area_container}>
                            {/* header */}
                            <div className={chatViewStyle.input_area_header}>
                                {/* 左侧 */}
                                <div className={chatViewStyle.input_area_header_left}>
                                {inputAreaIcons.slice(0, 4).map((item) => (
                                        <i key={item.label} className={`iconfont ${item.icon} ${chatViewStyle.input_area_icon}`} onClick={() => handleClickHeaderIcon(item.method)}></i>
                                ))}
                                </div>
                                {/* 右侧 */}
                                <div className={chatViewStyle.input_area_header_right}>
                                {inputAreaIcons.slice(4, 6).map((item) => (
                                        <i key={item.label} className={`iconfont ${item.icon} ${chatViewStyle.input_area_icon}`} onClick={() => handleClickHeaderIcon(item.method)}></i>
                                ))}
                                </div>
                            </div>
                            {/* body */}
                            <div className={chatViewStyle.input_area_body}>
                                <Input.TextArea
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    autoSize={{ minRows: 2, maxRows: 4 }}
                                    placeholder="请输入消息"
                                    className={chatViewStyle.input_textarea}
                                    style={{border: "none"}}
                                />

                            </div>
                            <div className={chatViewStyle.input_area_footer}>
                                <Button type="primary" onClick={sendMessage} className={chatViewStyle.send_button}>
                                    发送
                                </Button>
                            </div>

                        </div>
                    </>
                ) : (
                    <div className={chatViewStyle.no_chat}>请选择一个会话</div>
                )}
                {/* 文件上传弹窗 */}
                {fileUploaderVisible && 
                <div className={chatViewStyle.file_uploader_container}>
                    <i className={`iconfont icon-close ${chatViewStyle.icon_close}`} onClick={() => setFileUploaderVisible(false)}></i>
                    <FileUploader
                    config={{
                        maxSize: 100 * 1024 * 1024,        // 最大文件大小：100MB
                        chunkSize: 5 * 1024 * 1024         // 分片大小：5MB（默认分片大小）
                    }}
                        multiple={false}                      // 单文件上传
                        onSuccess={handleFileUploadSuccess}            // 上传成功回调
                        // onError={handleError}                // 上传失败回调
                    />
                </div>
                }
            </div>
        </div>
    );
}

export default ChatView;