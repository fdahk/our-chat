import { forwardRef, useState } from 'react';
import styles from './style.module.scss';
import { addFriend } from '@/globalApi/friendApi';
import { useSelector } from 'react-redux';
import type { RootState } from '@/store/rootStore';

interface AddFriendModalProps {
    avatar: string;
    username: string;
    wxid: string;
    region: string;
    gender: string;
}

const AddFriendModal = forwardRef<HTMLDivElement, AddFriendModalProps>(
  ({ avatar, username, wxid, region, gender }, ref) => {
    const userId = useSelector((state: RootState) => state.user.id);
    const [isSent, setIsSent] = useState(false);
    // 发起好友请求
    const handleAddFriend = () => {
        addFriend({userId, friend_id: Number(wxid)});
        setIsSent(true);
    }
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
          <button className={styles.button} onClick={handleAddFriend}>{isSent ? '已发送' : '添加到通讯录'}</button>
        </div>
      </div>
    );
  }
);

export default AddFriendModal;