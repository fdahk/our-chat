import { type ReactNode } from 'react';
import SearchModal from '@/globalComponents/searchModal';
import styles from './style.module.scss';

// 左栏顶部搜索区:聊天页与通讯录页共用同一容器,内部搜索框一致,
// 右侧操作(添加好友 / 发起会话等)由各页通过 action 槽传入。
interface SearchHeaderProps {
    placeholder?: string;
    onSearchChange: (value: string) => void;
    action?: ReactNode;
}

function SearchHeader({ placeholder, onSearchChange, action }: SearchHeaderProps) {
    return (
        <div className={styles.container}>
            <SearchModal searchChange={onSearchChange} placeholder={placeholder} />
            {action != null && <div className={styles.action}>{action}</div>}
        </div>
    );
}

export default SearchHeader;
