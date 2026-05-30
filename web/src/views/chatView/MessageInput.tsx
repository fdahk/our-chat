import { useState } from 'react';
import { Input, Button } from 'antd';
import chatViewStyle from './style.module.scss';

// 输入区图标配置
const inputAreaIcons = [
    { label: '表情', icon: 'icon-meh', method: 'handleClickEmoji' },
    { label: '文件', icon: 'icon-folder', method: 'handleClickFile' },
    { label: '截图', icon: 'icon-scissor', method: 'handleClickScreenshot' },
    { label: '聊天记录', icon: 'icon-comment', method: 'handleClickChatRecord' },
    { label: '语音聊天', icon: 'icon-phone', method: 'handleClickVoice' },
    { label: '视频聊天', icon: 'icon-videocameraadd', method: 'handleClickVideo' },
];

interface MessageInputProps {
    onSend: (text: string) => void;
    onHeaderIconClick: (method: string) => void;
}

// 输入区独立成组件，让高频的草稿态（每次按键 setInput）只重渲染这一小块，
// 不再波及上层 ChatView 的消息列表与会话列表
function MessageInput({ onSend, onHeaderIconClick }: MessageInputProps) {
    const [input, setInput] = useState('');

    const send = () => {
        if (!input.trim()) return;
        onSend(input);
        setInput('');
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
        } else if (e.key === 'Enter' && e.shiftKey) {
            e.preventDefault();
            setInput((prev) => prev + '\n');
        }
    };

    return (
        <div className={chatViewStyle.input_area_container}>
            {/* header */}
            <div className={chatViewStyle.input_area_header}>
                {/* 左侧 */}
                <div className={chatViewStyle.input_area_header_left}>
                    {inputAreaIcons.slice(0, 4).map((item) => (
                        <i
                            key={item.label}
                            className={`iconfont ${item.icon} ${chatViewStyle.input_area_icon}`}
                            onClick={() => onHeaderIconClick(item.method)}
                        ></i>
                    ))}
                </div>
                {/* 右侧 */}
                <div className={chatViewStyle.input_area_header_right}>
                    {inputAreaIcons.slice(4, 6).map((item) => (
                        <i
                            key={item.label}
                            className={`iconfont ${item.icon} ${chatViewStyle.input_area_icon}`}
                            onClick={() => onHeaderIconClick(item.method)}
                        ></i>
                    ))}
                </div>
            </div>
            {/* body */}
            <div className={chatViewStyle.input_area_body}>
                <Input.TextArea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    autoSize={{ minRows: 2, maxRows: 4 }}
                    placeholder="请输入消息"
                    className={chatViewStyle.input_textarea}
                    style={{ border: 'none' }}
                />
            </div>
            <div className={chatViewStyle.input_area_footer}>
                <Button type="primary" onClick={send} className={chatViewStyle.send_button}>
                    发送
                </Button>
            </div>
        </div>
    );
}

export default MessageInput;
