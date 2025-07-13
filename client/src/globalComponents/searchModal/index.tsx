import React, { useEffect, useRef, useState } from 'react';
import styles from './style.module.scss';
interface SearchModalProps {
    searchChange: (value: string) => void;
    placeholder?: string;
}
function SearchModal({searchChange, placeholder}: SearchModalProps) {
    const [active, setActive] = useState(false);
    const [value, setValue] = useState('');
    const searchRef = useRef<HTMLDivElement>(null);
    // 监听全局点击
    useEffect(() => {
        function handleClick(event: MouseEvent) {
            if (
                searchRef.current &&
                !searchRef.current.contains(event.target as Node)
            ) {
                setActive(false);
                searchRef.current && searchRef.current.blur();
            }
        }

        document.addEventListener('mousedown', handleClick);
        return () => {
            document.removeEventListener('mousedown', handleClick);
        };
    }, []);

    return (
        <div ref={searchRef} className={`${styles.container} ${active ? styles.active : ''}`}>
            <i className={`iconfont icon-search ${styles.icon_search}`}></i>
            <input type="text" placeholder={placeholder}
            onFocus={() => setActive(true)}
            value={value} onChange={(e) => {
                setValue(e.target.value);
                searchChange(e.target.value);
            }}/>
            {/*删除按钮 */}
            <i style={{display: active ? 'block' : 'none'}} 
            className={`iconfont icon-close ${styles.icon_close}`} 
            // 失焦本身是不可被拦截的，失焦的原理是在鼠标按下时触发的
            // 所以阻止鼠标按下事件的默认行为即可
            onMouseDown={(e) => e.preventDefault()}
            // 注：直接修改值无法触发input的onchange事件，其只受用户输入影响（键入、粘贴
            onClick={() => {
                setValue('');
                searchChange(''); // 手动触发
            }}>
            </i>
        </div>
    )
}

export default SearchModal;