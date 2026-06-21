// 通用 Toast(替代 antd message)。Provider + useToast() hook。
//
// 用法:
//   App 顶层包一次:
//     <ToastProvider>...</ToastProvider>
//   组件里:
//     const toast = useToast();
//     toast.ok('已保存'); toast.err('失败'); toast.info('提示');
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { bindToast } from './bridge';
import styles from './style.module.scss';

type ToastTone = 'ok' | 'err' | 'info';
interface ToastItem { id: number; tone: ToastTone; text: string }

export interface ToastApi {
  show: (text: string, tone?: ToastTone) => void;
  ok:   (text: string) => void;
  err:  (text: string) => void;
  info: (text: string) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
  }, []);

  const show = useCallback((text: string, tone: ToastTone = 'info') => {
    const id = ++idRef.current;
    setItems((xs) => [...xs, { id, tone, text }]);
    window.setTimeout(() => remove(id), 2600);
  }, [remove]);

  const api = useMemo<ToastApi>(() => ({
    show,
    ok:   (text) => show(text, 'ok'),
    err:  (text) => show(text, 'err'),
    info: (text) => show(text, 'info'),
  }), [show]);

  // 把 React 上下文里的 api 暴露给非 React 模块(如 axios 拦截器)。
  useEffect(() => {
    bindToast(api);
    return () => bindToast(null);
  }, [api]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className={styles.layer} aria-live="polite">
        {items.map((it) => (
          <div
            key={it.id}
            className={`${styles.toast} ${styles[`toast-${it.tone}` as const]}`}
          >
            <span className={styles.dot} />
            <span>{it.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// 与 ToastProvider 同文件的 hook 导出。react-refresh 偏好"组件文件只导出组件",
// 这里 useToast/ToastApi 与组件强耦合(同一 Context),拆出去反而割裂 API。
// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastApi {
  const v = useContext(ToastCtx);
  if (!v) throw new Error('useToast must be used inside <ToastProvider>');
  return v;
}
