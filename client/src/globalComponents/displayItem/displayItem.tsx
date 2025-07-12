import styles from './style.module.scss';
import type { CSSProperties } from 'react';
interface DisplayItemProps {
    id: string;
    avatar: string;
    title: string;
    content: string;
    isActive: boolean;
    handleClick: (id: string) => void;
    style?: CSSProperties;
}

function DisplayItem({ id, avatar, title, content, isActive, handleClick, style }: DisplayItemProps) {
    return (
        <div
        className={`${styles.display_item} ${isActive ? styles.active : ''}`}
        onClick={() => { handleClick(id); }}
        style={style}
        >
            <div className={styles.item_avatar}>
                <img src={avatar} alt="" />
            </div>
            <div className={styles.item_content_container}>
                <div className={styles.item_title}>{title}</div>
                {
                    content && <div className={styles.item_content}>{content}</div>
                }
            </div>
        </div>
    )
}

export default DisplayItem;