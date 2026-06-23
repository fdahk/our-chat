import { useState } from 'react';
import Button from '@/globalComponents/button';
import { useLang } from '@/i18n';
import styles from './style.module.scss';

// 顶部可选操作图标(表情 / 文件 / 语音 / 视频 等);agent 场景不传则不渲染头部
export interface ComposerAction {
  label: string;
  icon: string; // iconfont class, e.g. 'icon-meh'
  method: string;
}

interface ChatComposerProps {
  onSend: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
  sending?: boolean;
  sendLabel?: string;
  leftActions?: ComposerAction[];
  rightActions?: ComposerAction[];
  onActionClick?: (method: string) => void;
}

// 全局通用聊天输入框。草稿态自管理(每次按键只重渲染本小块,不波及上层消息列表),
// Enter 发送、Shift+Enter 换行。好友聊天 / agent 知识对话 / agent 任务共用同一套。
function ChatComposer({
  onSend,
  placeholder,
  disabled = false,
  sending = false,
  sendLabel,
  leftActions,
  rightActions,
  onActionClick,
}: ChatComposerProps) {
  const { t } = useLang();
  const [input, setInput] = useState('');

  const send = () => {
    const text = input.trim();
    if (!text || disabled || sending) return;
    onSend(text);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const hasHeader = (leftActions?.length ?? 0) > 0 || (rightActions?.length ?? 0) > 0;

  return (
    <div className={styles.composer}>
      {hasHeader && (
        <div className={styles.header}>
          <div className={styles.headerSide}>
            {leftActions?.map((it) => (
              <i
                key={it.label}
                title={it.label}
                className={`iconfont ${it.icon} ${styles.icon}`}
                onClick={() => onActionClick?.(it.method)}
              />
            ))}
          </div>
          <div className={styles.headerSide}>
            {rightActions?.map((it) => (
              <i
                key={it.label}
                title={it.label}
                className={`iconfont ${it.icon} ${styles.icon}`}
                onClick={() => onActionClick?.(it.method)}
              />
            ))}
          </div>
        </div>
      )}
      <div className={styles.body}>
        <textarea
          className={styles.textarea}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          placeholder={placeholder}
          disabled={disabled}
        />
      </div>
      <div className={styles.footer}>
        <Button
          variant="primary"
          size="sm"
          onClick={send}
          loading={sending}
          disabled={disabled}
          className={styles.sendBtn}
        >
          {sendLabel ?? t('chat.send')}
        </Button>
      </div>
    </div>
  );
}

export default ChatComposer;
