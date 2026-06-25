import styles from './style.module.scss';

export interface PopoverMenuItem {
  key: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
}

// 通用弹出菜单(左下 ☰ / 右键等场景共用)。主题感知。
function PopoverMenu({ items }: { items: PopoverMenuItem[] }) {
  return (
    <div className={styles.menu}>
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          className={`${styles.item} ${it.danger ? styles.danger : ''}`}
          onClick={it.onClick}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export default PopoverMenu;
