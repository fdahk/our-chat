import { forwardRef } from 'react';
import styles from './style.module.scss';

interface AddFriendModalProps {
    avatar: string;
    username: string;
    wxid: string;
    region: string;
    gender: string;
}

const AddFriendModal = forwardRef<HTMLDivElement, AddFriendModalProps>(
  ({ avatar, username, wxid, region, gender }, ref) => {
    return (
      <div ref={ref} className={styles.container}>
        {/* 头部 */}
        <div className={styles.header}>
          {/* 头像 */}
          <img className={styles.avatar} src={avatar} alt="头像" />
          {/* 好友信息 */}
          <div className={styles.info}>
            <div className={styles.username}>
              {username}
              {gender === 'male'
                ? <i className={`iconfont icon-user ${styles.iconUser}`} />
                : <i className={`iconfont icon-user ${styles.iconUser}`} style={{ color: 'var(--warning-color)' }} />}
            </div>
            <div className={styles.wxid}>微信号：{wxid}</div>
            <div className={styles.region}>地区：{region}</div>
          </div>
        </div>
        {/* 底部 */}
        <div className={styles.footer}>
          <button className={styles.button}>添加到通讯录</button>
        </div>
      </div>
    );
  }
);

export default AddFriendModal;