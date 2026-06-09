// agent-server 鉴权门(phase 1)。本地账号登录 / 注册,token 存 localStorage。
// 之后切 OAuth 时把本文件换成 "code+PKCE 跳转 + 回填 token" 即可,上层无感。
//
// 客户端校验对齐 agent-server DTO 约束(防 400 后端校验回路):
//   - username: ^[A-Za-z0-9_-]+$,3-64 字符
//   - password: 8-128 字符
//   - displayName(仅注册必填):1-128 字符
import { useState, type FormEvent } from 'react';
import TextInput from '@/globalComponents/textInput';
import PasswordInput from '@/globalComponents/passwordInput';
import Button from '@/globalComponents/button';
import { useToast } from '@/globalComponents/toast';
import { useLang } from '@/i18n';
import { agentLogin, agentRegister } from '../api';
import styles from './style.module.scss';

interface Props {
  onLogin: (user: { username: string; displayName: string }) => void;
}

const USERNAME_RE = /^[A-Za-z0-9_-]+$/;

interface FieldErr {
  username?: string;
  password?: string;
  displayName?: string;
}

function LoginGate({ onLogin }: Props) {
  const { t } = useLang();
  const toast = useToast();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErr>({});

  function validate(): FieldErr {
    const e: FieldErr = {};
    if (!username) e.username = t('agent.loginGate.errs.usernameRequired');
    else if (username.length < 3 || username.length > 64)
      e.username = t('agent.loginGate.errs.usernameLen');
    else if (!USERNAME_RE.test(username))
      e.username = t('agent.loginGate.errs.usernameChars');

    if (!password) e.password = t('agent.loginGate.errs.passwordRequired');
    else if (password.length < 8 || password.length > 128)
      e.password = t('agent.loginGate.errs.passwordLen');

    if (mode === 'register') {
      if (!displayName.trim()) e.displayName = t('agent.loginGate.errs.displayNameRequired');
      else if (displayName.length > 128) e.displayName = t('agent.loginGate.errs.displayNameLen');
    }
    return e;
  }

  async function onSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const err = validate();
    setErrors(err);
    if (Object.keys(err).length) { toast.err(t('common.invalid')); return; }

    setLoading(true);
    try {
      if (mode === 'register') {
        await agentRegister(username, password, displayName.trim());
      }
      const { user } = await agentLogin(username, password);
      onLogin({ username: user.username, displayName: user.displayName });
      toast.ok(t('agent.loginGate.ok'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.err(`${t('agent.loginGate.fail')}: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.head}>
          <i className="iconfont icon-robot-fill" />
          <h3>{t('agent.loginGate.title')}</h3>
          <p className={styles.sub}>{t('agent.loginGate.sub')}</p>
        </div>

        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <TextInput
            label={t('auth.fields.username')}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            error={errors.username}
          />
          <PasswordInput
            label={t('auth.fields.password')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            error={errors.password}
          />
          {mode === 'register' && (
            <TextInput
              label={t('agent.loginGate.displayName')}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="nickname"
              error={errors.displayName}
            />
          )}
          <Button type="submit" variant="primary" size="lg" block loading={loading}>
            {mode === 'login' ? t('agent.loginGate.signIn') : t('agent.loginGate.signUp')}
          </Button>
        </form>

        <div className={styles.foot}>
          <Button
            variant="link"
            type="button"
            onClick={() => {
              setMode((m) => (m === 'login' ? 'register' : 'login'));
              setErrors({});
            }}
          >
            {mode === 'login' ? t('agent.loginGate.toRegister') : t('agent.loginGate.toLogin')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default LoginGate;
