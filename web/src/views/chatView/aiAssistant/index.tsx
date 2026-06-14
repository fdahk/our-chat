// 主聊天窗口内的「AI 助手」面板。
//
// AI 是横切层,完全不碰 IM 的消息管线(socket / globalMessages / seq / ack)。本面板
// 用 our-chat 已登录会话经 BFF(/oauth/agent-token)零接触换出 agent-server token,
// 再复用 agentView 的 ConversationsTab(SSE 流式 RAG 对话)。token 到手前展示连接态。

import { useCallback, useEffect, useState } from 'react';
import { useLang } from '@/i18n';
import Button from '@/globalComponents/button';
import { ensureAgentToken } from '@/views/agentView/agentAuth';
import ConversationsTab from '@/views/agentView/tabs/conversationsTab';
import styles from './style.module.scss';

type Phase = 'connecting' | 'ready' | 'error';

function AiAssistantPanel() {
  const { t } = useLang();
  const [phase, setPhase] = useState<Phase>('connecting');

  const connect = useCallback(async () => {
    setPhase('connecting');
    try {
      await ensureAgentToken();
      setPhase('ready');
    } catch {
      // 失败原因(会话过期 / CSRF / 网络)对用户无意义,统一引导重试。
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        await ensureAgentToken();
        if (alive) setPhase('ready');
      } catch {
        if (alive) setPhase('error');
      }
    })();
    return () => { alive = false; };
  }, []);

  if (phase === 'connecting') {
    return <div className={styles.state}>{t('agent.inChat.connecting')}</div>;
  }
  if (phase === 'error') {
    return (
      <div className={styles.state}>
        <div className={styles.stateMsg}>{t('agent.inChat.connectFail')}</div>
        <Button variant="primary" size="sm" onClick={() => void connect()}>
          {t('agent.inChat.retry')}
        </Button>
      </div>
    );
  }
  return <ConversationsTab />;
}

export default AiAssistantPanel;
