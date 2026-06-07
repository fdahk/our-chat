// 通用文本输入。所有页面共享。
// 样式 token 取自 :root / .theme-dark 的 --ui-* CSS 变量,自动跟随当前主题。
import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import styles from './style.module.scss';

export interface TextInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  error?: string;
  hint?: string;
}

const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { label, prefix, suffix, error, hint, className, id, ...rest },
  ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <div className={`${styles.field} ${error ? styles.fieldError : ''} ${className ?? ''}`}>
      {label && <label htmlFor={inputId} className={styles.label}>{label}</label>}
      <div className={styles.inputWrap}>
        {prefix && <span className={styles.affix}>{prefix}</span>}
        <input ref={ref} id={inputId} className={styles.input} {...rest} />
        {suffix && <span className={styles.affix}>{suffix}</span>}
      </div>
      {(error || hint) && <div className={styles.feedback}>{error ?? hint}</div>}
    </div>
  );
});

export default TextInput;
