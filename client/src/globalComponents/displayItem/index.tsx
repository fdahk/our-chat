import styles from './style.module.scss';
interface DisplayItemProps {
    id: string;
    avatar: string;
    title: string;
    content: string;
    isActive?: boolean;
    handleClick?: (id: string) => void;
    style?: {
        width: string;
        height: string;
        backgroundColor?: string;
    };
}

// 函数参数默认为空函数，避免在调用时出现undefined
function DisplayItem({ id, avatar, title, content, isActive, handleClick = () => {}, style }: DisplayItemProps) {
    return (
        <div
        className={`${styles.display_item} ${isActive ? styles.active : ''}`}
        onClick={() => { handleClick(id); }}
        style={{backgroundColor: style?.backgroundColor}}
        >
            <div className={styles.item_avatar} style={{width: style?.width, height: style?.height}}>
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