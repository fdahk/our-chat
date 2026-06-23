// 全局主题(浅/深/跟随系统)。把已解析的明暗写到 <html data-theme>,CSS token 据此切换;
// 持久化到 localStorage,'system' 时监听系统偏好。antd 的明暗算法由 style/antD 读 resolved 决定。
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
type Resolved = 'light' | 'dark';

const STORAGE_KEY = 'oc.theme';

function readStored(): ThemeMode {
  const v = localStorage.getItem(STORAGE_KEY);
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
}

function systemDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolve(mode: ThemeMode): Resolved {
  return mode === 'system' ? (systemDark() ? 'dark' : 'light') : mode;
}

function applyToDom(resolved: Resolved): void {
  document.documentElement.dataset.theme = resolved;
}

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: Resolved;
  setMode: (m: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStored);
  const [resolved, setResolved] = useState<Resolved>(() => resolve(readStored()));

  // mode 变更:解析明暗 → 写 DOM + 持久化
  useLayoutEffect(() => {
    const r = resolve(mode);
    setResolved(r);
    applyToDom(r);
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  // 'system' 时跟随系统偏好变化
  useEffect(() => {
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const r: Resolved = mq.matches ? 'dark' : 'light';
      setResolved(r);
      applyToDom(r);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [mode]);

  const setMode = useCallback((m: ThemeMode) => setModeState(m), []);

  return (
    <ThemeContext.Provider value={{ mode, resolved, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

// 与 ThemeProvider 同文件的 hook 导出。react-refresh 偏好"组件文件只导出组件",
// 这里同 ToastProvider 一样豁免:provider 与其 hook 放一起更内聚。
// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>');
  return ctx;
}
