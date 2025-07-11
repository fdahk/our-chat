import directoryViewStyle from './index.module.scss';
import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import FriendModal from '@/globalComponents/friendModal/friendModal';
import type { Friend, FriendInfoList } from '@/globalType/friend';
function DirectoryView() {
    const [friendList, setFriendList] = useState<Friend[]>([]);
    const [friendInfo, setFriendInfo] = useState<FriendInfoList>({});
    const [activeFriend, setActiveFriend] = useState<{ friend_id: number, remark: string | null } | null>(null);
    const globalFriendList = useSelector((state: any) => state.chat.globalFriendList);
    const globalFriendInfoList = useSelector((state: any) => state.chat.globalFriendInfoList);
    // 获取好友列表
    useEffect(() => {
        setFriendList(globalFriendList);
        setFriendInfo(globalFriendInfoList);
    }, []);
    // 点击好友
    const handleFriendClick = (friend: { friend_id: number, remark: string | null }) => {
        setActiveFriend(friend);
    }
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
                            onClick={() => handleFriendClick(item)}
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
                {activeFriend && (
                    <FriendModal
                    style={{
                        backgroundColor: 'transparent',
                        width: '400px',
                        height: '300px',
                        boxShadow: 'none',
                    }}
                    avatar={friendInfo[activeFriend?.friend_id as number]?.avatar 
                        ? `http://localhost:3007${friendInfo[activeFriend?.friend_id as number].avatar}` 
                        : 'src/assets/images/defaultAvatar.jpg'}
                    username={friendInfo[activeFriend?.friend_id as number]?.username}
                    wxid={activeFriend?.friend_id.toString() as string} 
                    region="中国" 
                    remark={activeFriend?.remark as string | null}
                    gender={friendInfo[activeFriend?.friend_id as number].gender as string}
                    />
                )}
            </div>
        </div>
    )
}

export default DirectoryView;