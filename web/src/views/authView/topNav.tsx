import { useLang } from '@/i18n';
import { PROFILE, pick } from './models';
import styles from './topNav.module.scss';

export type PageKey = 'home' | 'works';

interface Props {
  page: PageKey;
  onChange: (p: PageKey) => void;
}

function TopNav({ page, onChange }: Props) {
  const { t, lang, toggle } = useLang();
  const tabs: { key: PageKey; label: string }[] = [
    { key: 'home',  label: t('auth.nav.home') },
    { key: 'works', label: t('auth.nav.works') },
  ];

  return (
    <header className={styles.nav}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden />
          <span className={styles.brandText}>
            {t('auth.brand')}
            <span className={styles.brandBy}> · {pick(lang, PROFILE.name)}</span>
          </span>
        </div>

        <nav className={styles.tabs} aria-label="primary">
          {tabs.map((n) => (
            <button
              key={n.key}
              type="button"
              className={`${styles.tab} ${page === n.key ? styles.tabActive : ''}`}
              onClick={() => onChange(n.key)}
            >
              {n.label}
            </button>
          ))}
        </nav>

        <button
          type="button"
          className={styles.langBtn}
          onClick={toggle}
          aria-label="toggle language"
        >
          <span className={lang === 'zh' ? styles.langOn : styles.langOff}>中</span>
          <span className={styles.langSep}>/</span>
          <span className={lang === 'en' ? styles.langOn : styles.langOff}>EN</span>
        </button>
      </div>
    </header>
  );
}

export default TopNav;
