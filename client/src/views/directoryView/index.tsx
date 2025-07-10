import directoryViewStyle from './index.module.scss';
import { useState, useEffect } from 'react';
import { getFriendList } from '@/globalApi/friendApi';
import { useSelector } from 'react-redux';
function DirectoryView() {
    const user = useSelector((state: any) => state.user);
    const [friendList, setFriendList] = useState<{ friend_id: number, remark: string }[]>([]);
    const [friendInfo, setFriendInfo] = useState<{ [key: number]: { username: string, avatar: string } }>({});
    // 获取好友列表
    useEffect(() => {
        getFriendList(user.id).then(res => {
            setFriendList(res.data.friendId); //返回好友id
            setFriendInfo(res.data.friendInfo); //返回好友信息
        });
        
    }, []);

    return (
        <div className={directoryViewStyle.directory_view_container}>
            {/* 左侧 */}
            <div className={directoryViewStyle.directory_view_left}>
                {/* 搜索 */}
                <div className={directoryViewStyle.directory_view_left_header}>header</div>
                {/* 好友列表 */}
                <div className={directoryViewStyle.directory_view_left_body}>
                    {friendList.map((item) => (
                        <div
                            key={item.friend_id}
                            className={`${directoryViewStyle.directory_view_left_body_item}`}
                        >
                            <div className={directoryViewStyle.item_avatar}>
                                <img src={friendInfo[item.friend_id]?.avatar 
                                    ? `http://localhost:3007${friendInfo[item.friend_id].avatar}` 
                                    : 'src/assets/images/defaultAvatar.jpg'} alt="" />
                            </div>
                            <div className={directoryViewStyle.item_title}>{item.remark || friendInfo[item.friend_id].username}</div>
                        </div>
                    ))}
                </div>
            </div>
            {/* 右侧 */}
            <div className={directoryViewStyle.directory_view_right}>
                R
            </div>
        </div>
    )
}

export default DirectoryView;