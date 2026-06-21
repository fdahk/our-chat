// 通用按钮。三种 variant + 三种 size,支持 loading / icon / block。
import type { ReactNode, MouseEvent } from 'react';
import styles from './style.module.scss';

export type ButtonVariant = 'primary' | 'ghost' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  children?: ReactNode;
  className?: string;
}

function Button({
  variant = 'primary',
  size = 'md',
  block,
  loading,
  icon,
  type = 'button',
  disabled,
  onClick,
  children,
  className,
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={[
        styles.btn,
        styles[`btn-${variant}` as const],
        styles[`btn-${size}` as const],
        block ? styles.btnBlock : '',
        className ?? '',
      ].filter(Boolean).join(' ')}
    >
      {loading
        ? <span className={styles.spinner} aria-hidden />
        : icon && <span className={styles.btnIcon}>{icon}</span>}
      {children && <span>{children}</span>}
    </button>
  );
}

export default Button;
