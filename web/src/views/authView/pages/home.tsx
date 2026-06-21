import { useState } from 'react';
import LoginForm from '../loginForm';
import RegisterForm from '../registerForm';
import { useLang } from '@/i18n';
import { PROFILE, SKILLS, WORKS, pick } from '../models';
import styles from './home.module.scss';

function Home() {
  const { t, lang } = useLang();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const switchMode = () => setMode((m) => (m === 'login' ? 'register' : 'login'));

  return (
    <div className={styles.page}>
      {/* ─── Hero + Form 同屏 ─── */}
      <section className={styles.hero}>
        <div className={styles.heroLeft}>
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowDot} />
            {t('auth.eyebrow')}
          </div>

          <h1 className={styles.title}>
            {pick(lang, PROFILE.name)}
            <span className={styles.titlePinyin}>· {PROFILE.pinyin}</span>
          </h1>

          <p className={styles.tagline}>{pick(lang, PROFILE.slogan)}</p>
          <p className={styles.intro}>{t('auth.intro')}</p>

          <div className={styles.meta}>
            <span>{pick(lang, PROFILE.school)}</span>
            <span className={styles.metaSep} />
            <span>{pick(lang, PROFILE.intent)}</span>
            <span className={styles.metaSep} />
            <span>{pick(lang, PROFILE.age)}</span>
          </div>
        </div>

        <div className={styles.heroRight}>
          {mode === 'login'
            ? <LoginForm switchModel={switchMode} />
            : <RegisterForm switchModel={switchMode} />}
        </div>
      </section>

      {/* ─── About ─── */}
      <section className={styles.section}>
        <SectionHead label={t('auth.sections.about')} index="01" />
        <div className={styles.aboutGrid}>
          <Cell title={t('auth.cells.identity')} value={`${pick(lang, PROFILE.name)} · ${pick(lang, PROFILE.age)}`} hint={pick(lang, PROFILE.school)} />
          <Cell title={t('auth.cells.track')} value={pick(lang, PROFILE.intent)} hint={t('auth.cells.targetingRoles')} />
          <Cell title={t('auth.cells.award')} value={pick(lang, PROFILE.award)} hint={t('auth.cells.nationalLevel')} />
          <Cell title={t('auth.cells.online')} value={`@${PROFILE.github}`} hint={t('auth.cells.githubJuejin')} />
        </div>
      </section>

      {/* ─── Experience ─── */}
      <section className={styles.section}>
        <SectionHead label={t('auth.sections.experience')} index="02" />
        <div className={styles.timeline}>
          {WORKS.map((w, i) => (
            <article key={i} className={styles.tlItem}>
              <div className={styles.tlMeta}>
                <div className={styles.tlPeriod}>{w.period}</div>
                <div className={styles.tlLocation}>{pick(lang, w.location)}</div>
              </div>
              <div className={styles.tlBody}>
                <div className={styles.tlHead}>
                  <h3 className={styles.tlRole}>{pick(lang, w.role)}</h3>
                  <span className={styles.tlAt}>—</span>
                  <span className={styles.tlCompany}>{pick(lang, w.company)}</span>
                </div>
                <ul className={styles.tlList}>
                  {w.highlights[lang].map((h, j) => <li key={j}>{h}</li>)}
                </ul>
                <div className={styles.tlStack}>
                  {w.stack.map((s) => <span key={s} className={styles.tlChip}>{s}</span>)}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ─── Skills ─── */}
      <section className={styles.section}>
        <SectionHead label={t('auth.sections.skills')} index="03" />
        <div className={styles.skills}>
          {SKILLS.map((g) => (
            <div key={g.title.zh} className={styles.skillRow}>
              <div className={styles.skillTitle}>{pick(lang, g.title)}</div>
              <div className={styles.skillTags}>
                {g.items.map((s) => <span key={s} className={styles.skillTag}>{s}</span>)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Contact ─── */}
      <section className={`${styles.section} ${styles.contact}`}>
        <SectionHead label={t('auth.sections.contact')} index="04" />
        <div className={styles.contactGrid}>
          <a className={styles.contactCell} href={`mailto:${PROFILE.email}`}>
            <div className={styles.contactKey}>{t('auth.cells.email')}</div>
            <div className={styles.contactVal}>{PROFILE.email}</div>
          </a>
          <a className={styles.contactCell} href={`tel:${PROFILE.phone.replace(/\s/g, '')}`}>
            <div className={styles.contactKey}>{t('auth.cells.phone')}</div>
            <div className={styles.contactVal}>{PROFILE.phone}</div>
          </a>
          <a className={styles.contactCell} href={`https://github.com/${PROFILE.github}`} target="_blank" rel="noreferrer">
            <div className={styles.contactKey}>GitHub</div>
            <div className={styles.contactVal}>@{PROFILE.github}</div>
          </a>
          <a className={styles.contactCell} href={`https://juejin.cn/user/${PROFILE.juejin}`} target="_blank" rel="noreferrer">
            <div className={styles.contactKey}>{t('auth.cells.juejin')}</div>
            <div className={styles.contactVal}>@{PROFILE.juejin}</div>
          </a>
        </div>

        <footer className={styles.foot}>
          <span>{t('auth.footer.copy')}</span>
          <span className={styles.footSep}>·</span>
        </footer>
      </section>
    </div>
  );
}

function SectionHead({ label, index }: { label: string; index: string }) {
  return (
    <header className={styles.sectionHead}>
      <span className={styles.sectionIndex}>{index}</span>
      <h2 className={styles.sectionLabel}>{label}</h2>
      <span className={styles.sectionLine} aria-hidden />
    </header>
  );
}

function Cell({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <div className={styles.cell}>
      <div className={styles.cellKey}>{title}</div>
      <div className={styles.cellVal}>{value}</div>
      <div className={styles.cellHint}>{hint}</div>
    </div>
  );
}

export default Home;
