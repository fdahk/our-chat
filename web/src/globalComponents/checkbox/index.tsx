// 通用 checkbox。受控用法,父级管 state。
import type { ReactNode } from 'react';
import styles from './style.module.scss';

export interface CheckboxProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  children?: ReactNode;
  disabled?: boolean;
}

function Checkbox({ checked, onChange, children, disabled }: CheckboxProps) {
  return (
    <label className={`${styles.checkbox} ${disabled ? styles.checkboxDisabled : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={styles.box}>
        <svg viewBox="0 0 16 16" aria-hidden>
          <path
            d="M3 8.5l3.5 3.5L13 5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {children && <span className={styles.label}>{children}</span>}
    </label>
  );
}

export default Checkbox;
