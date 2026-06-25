import { defaultAvatar } from '@/assets/images';
import styles from './style.module.scss';

// 资料卡(自己/他人共用)。呈现型组件:展示哪些信息行、哪些底部操作,由调用方按 isSelf 过滤后传入。
export interface ProfileAction {
  key: string;
  icon: string; // iconfont class
  label: string;
  onClick: () => void;
}
export interface ProfileRow {
  label: string;
  value: string;
}

interface ProfileCardProps {
  avatar?: string; // 完整 URL;空则用默认头像
  name: string;
  rows: ProfileRow[];
  actions: ProfileAction[];
}

function ProfileCard({ avatar, name, rows, actions }: ProfileCardProps) {
  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <img className={styles.avatar} src={avatar || defaultAvatar} alt="" />
        <div className={styles.headMeta}>
          <div className={styles.name} title={name}>{name}</div>
        </div>
      </div>

      {rows.length > 0 && (
        <div className={styles.rows}>
          {rows.map((r) => (
            <div key={r.label} className={styles.row}>
              <span className={styles.rowLabel}>{r.label}</span>
              <span className={styles.rowValue}>{r.value}</span>
            </div>
          ))}
        </div>
      )}

      {actions.length > 0 && (
        <div className={styles.actions}>
          {actions.map((a) => (
            <button key={a.key} type="button" className={styles.action} onClick={a.onClick}>
              <i className={`iconfont ${a.icon} ${styles.actionIcon}`} />
              <span className={styles.actionLabel}>{a.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default ProfileCard;
