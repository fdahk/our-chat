import { useState } from 'react';
import Button from '@/globalComponents/button';
import { useLang } from '@/i18n';
import chatViewStyle from './style.module.scss';

interface MessageInputProps {
    onSend: (text: string) => void;
    onHeaderIconClick: (method: string) => void;
}

// 输入区独立成组件,让高频的草稿态(每次按键 setInput)只重渲染这一小块,
// 不再波及上层 ChatView 的消息列表与会话列表
function MessageInput({ onSend, onHeaderIconClick }: MessageInputProps) {
    const { t } = useLang();
    const [input, setInput] = useState('');

    // 输入区图标配置
    const inputAreaIcons = [
        { label: t('chat.iconLabels.emoji'),      icon: 'icon-meh',           method: 'handleClickEmoji' },
        { label: t('chat.iconLabels.file'),       icon: 'icon-folder',        method: 'handleClickFile' },
        { label: t('chat.iconLabels.screenshot'), icon: 'icon-scissor',       method: 'handleClickScreenshot' },
        { label: t('chat.iconLabels.record'),     icon: 'icon-comment',       method: 'handleClickChatRecord' },
        { label: t('chat.iconLabels.voice'),      icon: 'icon-phone',         method: 'handleClickVoice' },
        { label: t('chat.iconLabels.video'),      icon: 'icon-videocameraadd',method: 'handleClickVideo' },
    ];

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
                <div className={chatViewStyle.input_area_header_left}>
                    {inputAreaIcons.slice(0, 4).map((item) => (
                        <i
                            key={item.label}
                            title={item.label}
                            className={`iconfont ${item.icon} ${chatViewStyle.input_area_icon}`}
                            onClick={() => onHeaderIconClick(item.method)}
                        ></i>
                    ))}
                </div>
                <div className={chatViewStyle.input_area_header_right}>
                    {inputAreaIcons.slice(4, 6).map((item) => (
                        <i
                            key={item.label}
                            title={item.label}
                            className={`iconfont ${item.icon} ${chatViewStyle.input_area_icon}`}
                            onClick={() => onHeaderIconClick(item.method)}
                        ></i>
                    ))}
                </div>
            </div>
            {/* body */}
            <div className={chatViewStyle.input_area_body}>
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={2}
                    placeholder={t('chat.placeholder')}
                    className={chatViewStyle.input_textarea}
                />
            </div>
            <div className={chatViewStyle.input_area_footer}>
                <Button variant="primary" size="sm" onClick={send} className={chatViewStyle.send_button}>
                    {t('chat.send')}
                </Button>
            </div>
        </div>
    );
}

export default MessageInput;
