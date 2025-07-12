import directoryViewStyle from './style.module.scss';
import { useState } from 'react';
import { useSelector } from 'react-redux';
import FriendModal from '@/globalComponents/friendModal/friendModal';
import type { Friend } from '@/globalType/friend';
import type { RootState } from '@/store/rootStore';
import DisplayItem from '@/globalComponents/displayItem/displayItem';
function DirectoryView() {
    const [activeFriend, setActiveFriend] = useState<{ friend_id: number, remark: string | null } | null>(null);
    const globalFriendList = useSelector((state: RootState) => state.chat.globalFriendList);
    const globalFriendInfoList = useSelector((state: RootState) => state.chat.globalFriendInfoList);
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
                    {globalFriendList.map((item: Friend) => (
                        <DisplayItem
                            key={item.friend_id}
                            id={item.friend_id.toString()}
                            title={item.remark || globalFriendInfoList[item.friend_id].username}
                            content={''}
                            isActive={activeFriend?.friend_id === item.friend_id}
                            handleClick={() => handleFriendClick(item)}
                            avatar={globalFriendInfoList[item.friend_id]?.avatar 
                                ? `http://localhost:3007${globalFriendInfoList[item.friend_id].avatar}` 
                                : 'src/assets/images/defaultAvatar.jpg'}
                        />
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
                    avatar={globalFriendInfoList[activeFriend?.friend_id as number]?.avatar 
                        ? `http://localhost:3007${globalFriendInfoList[activeFriend?.friend_id as number].avatar}` 
                        : 'src/assets/images/defaultAvatar.jpg'}
                    username={globalFriendInfoList[activeFriend?.friend_id as number]?.username}
                    wxid={activeFriend?.friend_id.toString() as string} 
                    region="中国" 
                    remark={activeFriend?.remark as string | null}
                    gender={globalFriendInfoList[activeFriend?.friend_id as number].gender as string}
                    />
                )}
            </div>
        </div>
    )
}

export default DirectoryView;