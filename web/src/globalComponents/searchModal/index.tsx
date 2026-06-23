import { useEffect, useRef, useState } from 'react';
import styles from './style.module.scss';
interface SearchModalProps {
    searchChange: (value: string) => void;
    placeholder?: string;
}
function SearchModal({ searchChange, placeholder }: SearchModalProps) {
    const [active, setActive] = useState(false);
    const [value, setValue] = useState('');
    const searchRef = useRef<HTMLDivElement>(null);
    // 监听全局点击:点击外部收起聚焦态
    useEffect(() => {
        function handleClick(event: MouseEvent) {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setActive(false);
            }
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    return (
        <div ref={searchRef} className={`${styles.container} ${active ? styles.active : ''}`}>
            <i className={`iconfont icon-search ${styles.icon_search}`}></i>
            <input
                type="text"
                placeholder={placeholder}
                onFocus={() => setActive(true)}
                value={value}
                onChange={(e) => {
                    setValue(e.target.value);
                    searchChange(e.target.value);
                }}
            />
            {/* 清除按钮:有内容或聚焦时显示。阻止 mousedown 默认行为以免触发失焦 */}
            {(active || value) && (
                <i
                    className={`iconfont icon-close ${styles.icon_close}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                        setValue('');
                        searchChange('');
                    }}
                ></i>
            )}
        </div>
    );
}

export default SearchModal;
