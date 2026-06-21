// AgentView 主入口:左侧 tab 切换(文档 / 对话 / 任务),右侧 tab 内容。
//
// 一键鉴权(微信式):复用 our-chat 已登录会话,经 BFF POST /oauth/agent-token 铸一枚
// agent-server-scoped 的 RS256 token(ensureAgentToken),再调 /auth/me 验活——agent-server
// 用 JWKS 验签并按 (iss,sub) zero-touch 建/取本地账号。用户无需在本面板单独登录;
// our-chat 会话失效时提示回 our-chat 重新登录。
import { useEffect, useState } from 'react';
import { useLang } from '@/i18n';
import { agentMe } from './api';
import { ensureAgentToken } from './agentAuth';
import DocumentsTab from './tabs/documentsTab';
import ConversationsTab from './tabs/conversationsTab';
import TasksTab from './tabs/tasksTab';
import styles from './style.module.scss';

type TabKey = 'documents' | 'conversations' | 'tasks';

function AgentView() {
  const { t } = useLang();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [me, setMe] = useState<{ username: string; displayName: string } | null>(null);
  const [tab, setTab] = useState<TabKey>('documents');

  // 进入页面即一键鉴权:铸 token → 验活(zero-touch 建号)。无需手动登录。
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await ensureAgentToken();
        const u = await agentMe();
        if (!cancelled) {
          setMe({ username: u.username, displayName: u.displayName });
          setStatus('ready');
        }
      } catch {
        // 铸造/验活失败通常意味着 our-chat 会话失效 → 引导回 our-chat 登录
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'loading') {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>{t('common.loading')}</div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>{t('agent.authError')}</div>
      </div>
    );
  }

  const tabs: { key: TabKey; label: string; icon: string }[] = [
    { key: 'documents', label: t('agent.tabs.documents'), icon: 'icon-folder' },
    { key: 'conversations', label: t('agent.tabs.conversations'), icon: 'icon-message' },
    { key: 'tasks', label: t('agent.tabs.tasks'), icon: 'icon-robot' },
  ];

  return (
    <div className={styles.container}>
      {/* 左侧 tab 栏 */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHead}>
          <div className={styles.brand}>
            <i className={`iconfont icon-robot-fill ${styles.brandIcon}`} />
            <span className={styles.brandText}>{t('agent.brand')}</span>
          </div>
          <div className={styles.userRow}>
            <span className={styles.userName}>{me?.displayName}</span>
          </div>
        </div>

        <nav className={styles.tabList}>
          {tabs.map((it) => (
            <button
              key={it.key}
              type="button"
              className={`${styles.tabBtn} ${tab === it.key ? styles.tabBtnActive : ''}`}
              onClick={() => setTab(it.key)}
            >
              <i className={`iconfont ${it.icon} ${styles.tabIcon}`} />
              <span>{it.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* 右侧 tab 内容 */}
      <section className={styles.main}>
        {tab === 'documents' && <DocumentsTab />}
        {tab === 'conversations' && <ConversationsTab />}
        {tab === 'tasks' && <TasksTab />}
      </section>
    </div>
  );
}

export default AgentView;
