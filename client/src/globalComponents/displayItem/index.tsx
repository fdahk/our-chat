// 导入样式模块，使用CSS Modules实现局部作用域样式
import styles from './style.module.scss';

/**
 * DisplayItem组件的属性接口
 * @property {string} id - 唯一标识符
 * @property {string} avatar - 头像图片的URL
 * @property {string} title - 标题文本
 * @property {string} content - 内容文本
 * @property {boolean} [isActive] - 可选，表示是否处于激活状态
 * @property {(id: string) => void} [handleClick] - 可选，点击事件的回调函数
 * @property {object} [style] - 可选，自定义样式对象
 * @property {string} style.width - 宽度
 * @property {string} style.height - 高度
 * @property {string} [style.backgroundColor] - 背景色
 */
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

/**
 * DisplayItem组件
 * 一个可复用的显示项组件，包含头像、标题和内容
 * @param {DisplayItemProps} props - 组件属性
 * @returns {JSX.Element} - 渲染的React元素
 */
function DisplayItem({ id, avatar, title, content, isActive, handleClick = () => {}, style }: DisplayItemProps) {
    return (
        // 外层容器，根据isActive状态添加active类名
        <div
            className={`${styles.display_item} ${isActive ? styles.active : ''}`}
            onClick={() => { handleClick(id); }}
            style={{backgroundColor: style?.backgroundColor}}
        >
            {/* 头像区域，可自定义宽高 */}
            <div className={styles.item_avatar} style={{width: style?.width, height: style?.height}}>
                <img src={avatar} alt="" />
            </div>
            {/* 内容区域 */}
            <div className={styles.item_content_container}>
                <div className={styles.item_title}>{title}</div>
                {/* 内容文本，仅在content存在时渲染 */}
                {content && <div className={styles.item_content}>{content}</div>}
            </div>
        </div>
    )
}

export default DisplayItem;