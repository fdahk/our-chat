// AgentView 主入口。左侧 tab 切换(文档 / 对话 / 任务),右侧 tab 内容。
//
// 鉴权门(phase 1):
//   - 挂载时若 localStorage 有 agentServer.token,调 /auth/me 验活
//   - 校验失败 → 清 token,显 LoginGate(本面板内置登录/注册)
//   - 通过 → 展示 tab 主体
// 这是为了让本面板自洽 ── 不依赖 our-chat 的会话状态,后续切 OAuth 时只换 LoginGate。
import { useEffect, useState } from 'react';
import { useLang } from '@/i18n';
import { agentLogout, agentMe, getToken } from './api';
import LoginGate from './loginGate';
import DocumentsTab from './tabs/documentsTab';
import ConversationsTab from './tabs/conversationsTab';
import TasksTab from './tabs/tasksTab';
import styles from './style.module.scss';

type TabKey = 'documents' | 'conversations' | 'tasks';

function AgentView() {
  const { t } = useLang();
  const [authReady, setAuthReady] = useState<'checking' | 'ok' | 'no'>('checking');
  const [me, setMe] = useState<{ username: string; displayName: string } | null>(null);
  const [tab, setTab] = useState<TabKey>('documents');

  // 进入页面时验活
  useEffect(() => {
    if (!getToken()) { setAuthReady('no'); return; }
    agentMe()
      .then((u) => { setMe({ username: u.username, displayName: u.displayName }); setAuthReady('ok'); })
      .catch(() => { setAuthReady('no'); });
  }, []);

  const handleLogin = (user: { username: string; displayName: string }) => {
    setMe(user);
    setAuthReady('ok');
  };

  const handleLogout = () => {
    agentLogout();
    setMe(null);
    setAuthReady('no');
  };

  if (authReady === 'checking') {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>{t('common.loading')}</div>
      </div>
    );
  }

  if (authReady === 'no') {
    return (
      <div className={styles.container}>
        <LoginGate onLogin={handleLogin} />
      </div>
    );
  }

  const tabs: { key: TabKey; label: string; icon: string }[] = [
    { key: 'documents',     label: t('agent.tabs.documents'),     icon: 'icon-folder' },
    { key: 'conversations', label: t('agent.tabs.conversations'), icon: 'icon-message' },
    { key: 'tasks',         label: t('agent.tabs.tasks'),         icon: 'icon-robot' },
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
            <button type="button" className={styles.logoutBtn} onClick={handleLogout}>
              {t('agent.logout')}
            </button>
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
        {tab === 'documents'     && <DocumentsTab />}
        {tab === 'conversations' && <ConversationsTab />}
        {tab === 'tasks'         && <TasksTab />}
      </section>
    </div>
  );
}

export default AgentView;
