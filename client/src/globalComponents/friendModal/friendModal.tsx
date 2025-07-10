import styles from './friendModal.module.scss';

interface FriendModalProps {
    style?: React.CSSProperties; //css原型
    avatar: string; // 定义类型可以用分号
    username: string;
    wxid: string;
    region: string;
    remark: string | null;
    gender: string;
}

function FriendModal({
    style,
    avatar,
    username,
    wxid,
    region,
    remark,
    gender,
}: FriendModalProps) {

  return (

      <div className={styles.modalCard} style={style}>
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
                    : <i className={`iconfont icon-user ${styles.iconUser}`} style={{color: 'var(--warning-color)'}}/>}
                </div>
                <div className={styles.wxid}>微信号：{wxid}</div>
                <div className={styles.region}>地区：{region}</div>
          </div>
        </div>
        {/* 分割线 */}
        <div className={styles.line} />
        {/* 备注 */}
        <div className={styles.row}>
            <span className={styles.label}>备注</span>
            <span className={styles.value}>{remark || <span className={styles.addRemark}>点击添加备注</span>}</span>
        </div>
        {/* 底部选项 */}
        <div className={styles.footer}>
            <div className={styles.action}>
                <i className={`iconfont icon-message`} />
                <span>发消息</span>
            </div>
            <div className={styles.action}>
                <i className={`iconfont icon-phone`} />
                <span>语音聊天</span>
            </div>
            <div className={styles.action}>
                <i className={`iconfont icon-video`} />
                <span>视频聊天</span>
            </div>
            </div>
      </div>

  );
}

export default FriendModal;