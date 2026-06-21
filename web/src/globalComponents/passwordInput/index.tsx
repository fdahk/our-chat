// 通用密码输入。基于 TextInput 包一层,suffix 是可切换的"显示密码"小按钮。
import { forwardRef, useCallback, useState } from 'react';
import { EyeInvisibleOutlined, EyeOutlined } from '@ant-design/icons';
import TextInput, { type TextInputProps } from '@/globalComponents/textInput';
import styles from './style.module.scss';

export type PasswordInputProps = Omit<TextInputProps, 'type' | 'suffix'>;

const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  props,
  ref,
) {
  const [visible, setVisible] = useState(false);
  const toggle = useCallback(() => setVisible((v) => !v), []);
  return (
    <TextInput
      ref={ref}
      {...props}
      type={visible ? 'text' : 'password'}
      suffix={
        <button
          type="button"
          onClick={toggle}
          className={styles.toggle}
          aria-label={visible ? 'hide password' : 'show password'}
          tabIndex={-1}
        >
          {visible ? <EyeOutlined /> : <EyeInvisibleOutlined />}
        </button>
      }
    />
  );
});

export default PasswordInput;
