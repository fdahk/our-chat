import { useEffect, useRef, useState } from 'react';
import TopNav, { type PageKey } from './topNav';
import Home from './pages/home';
import Works from './pages/works';
import styles from './style.module.scss';

function AuthView() {
  const [page, setPage] = useState<PageKey>('home');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // 切页时滚回顶部
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [page]);

  // 这里加 `theme-dark` ── 让子树里所有用 var(--ui-*) 的全局组件
  // (TextInput / Button / Checkbox …)自动切到深色面板配色。
  return (
    <div className={`${styles.shell} theme-dark`}>
      <TopNav page={page} onChange={setPage} />
      <main className={styles.scroll} ref={scrollRef}>
        <div className={`${styles.fade} ${styles.fadeIn}`} key={page}>
          {page === 'home' ? <Home /> : <Works />}
        </div>
      </main>
    </div>
  );
}

export default AuthView;
