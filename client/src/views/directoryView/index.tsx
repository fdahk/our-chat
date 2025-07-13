import directoryViewStyle from './style.module.scss';
import { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import FriendModal from '@/globalComponents/friendModal';
import type { RootState } from '@/store/rootStore';
import DisplayItem from '@/globalComponents/displayItem';
import SearchModal from '@/globalComponents/searchModal';
import { searchUser } from '@/globalApi/friendApi';
import AddFriendModal from '@/globalComponents/addFriendModal';
function DirectoryView() {
    const [activeFriend, setActiveFriend] = useState<{ friend_id: number, remark: string | null } | null>(null);
    const globalFriendList = useSelector((state: RootState) => state.chat.globalFriendList);
    const globalFriendInfoList = useSelector((state: RootState) => state.chat.globalFriendInfoList);
    const userId = useSelector((state: RootState) => state.user.id);
    // 点击好友
    const handleFriendClick = (friend: { friend_id: number, remark: string | null }) => {
        setActiveFriend(friend);
    }
    // 搜索
    const [searchValue, setSearchValue] = useState('');
    //绑定搜索值
    const handleSearchChange = (value: string) => {
        setSearchValue(value);
    }
    // 添加好友
    const [isAddingFriend, setIsAddingFriend] = useState(false);
    const handleClickAddFriend = () => {
        setIsAddingFriend(!isAddingFriend);
    }
    // 点击展示卡片搜索
    const [showAddFriendModal, setShowAddFriendModal] = useState(false);
    const addFriendModalRef = useRef<HTMLDivElement>(null); // 绑定组件 
    const [friendInfo, setFriendInfo] = useState<{id: number, username: string, avatar: string, gender: string}>();
    const [hasResult, setHasResult] = useState(true);
    const handleClickSearchFriend = async () => {
        if(searchValue.length < 1) return;
        const res = await searchUser({keyword: Number(searchValue), userId});
        if(res.data.exist) {
            if(res.data.isFriend) {
                // 用户存在且是好友
                setActiveFriend({ friend_id: res.data.friendInfo.id, remark: globalFriendList[res.data.friendInfo.id] || null });
            } else {
                // 用户存在且不是好友
                setShowAddFriendModal(true);
                setFriendInfo(res.data.friendInfo);
            }
        } else {
            // 用户不存在
            setHasResult(false);
        }
    }
    // 监听全局点击事件
    useEffect(() => {
        if (!showAddFriendModal) return;
        function handleClick(event: MouseEvent) {
          if (
            addFriendModalRef.current &&
            !addFriendModalRef.current.contains(event.target as Node)
          ) {
            setShowAddFriendModal(false);
          }
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [showAddFriendModal]);
    // 监听搜索值（为零时修改hasResult）
    useEffect(() => {
        if(searchValue.length < 1) {
            setHasResult(true);
        }
    }, [searchValue]);
    return (
        <div className={directoryViewStyle.container}>
            {/* 左侧 */}
            <div className={directoryViewStyle.left}>
                {/* 头部 */}
                <div className={directoryViewStyle.left_header}>
                    <SearchModal searchChange={handleSearchChange} placeholder={isAddingFriend ? '微信号/手机号' : '搜索'} />
                    {/* 切换添加好友搜索 */}
                    <div className={directoryViewStyle.left_header_add_user_container} 
                    onClick={handleClickAddFriend}>
                        {
                            isAddingFriend ? (
                                <p style={{fontSize: '11px'}}>取消</p>
                            ) : (
                                <i className={`iconfont icon-adduser ${directoryViewStyle.left_header_add_user}`}></i>
                            )
                        }
                    </div>
                </div>
                {/* 列表展示 */}
                <div className={directoryViewStyle.left_body}>
                    {
                        isAddingFriend 
                        ? (
                            <div style={{width: '100%', display: 'flex',flexDirection: 'column'}}>
                                {/* 搜索结果不存在时 */}
                                {
                                    !hasResult && (
                                        <div className={directoryViewStyle.noResult}>
                                            <p>无法找到该用户，请检查你填写的账号是否正确</p>
                                        </div>
                                    )
                                }
                                <DisplayItem
                                    id={''}
                                    avatar={'src/assets/images/searchUser.png'}
                                    title={'搜索：'}
                                    content={searchValue}
                                    handleClick={handleClickSearchFriend}
                                />
                                {/* 添加好友弹窗 */}
                                {showAddFriendModal && (
                                    <AddFriendModal
                                        ref={addFriendModalRef}
                                        avatar={friendInfo?.avatar ? `http://localhost:3007${friendInfo.avatar}` : 'src/assets/images/defaultAvatar.jpg'}
                                        username={friendInfo?.username as string}
                                        wxid={friendInfo?.id.toString() as string}
                                        region={'中国'}
                                        gender={friendInfo?.gender as string}
                                    />
                                )}
                            </div>
                        ) 
                        : (
                            // JS对象键（无论你写的是数字还是字符串），Object.keys() 返回的永远是字符串数组
                            Object.keys(globalFriendList).map((item: string) => (
                        // 注：includes分大小写
                        // 不做类型转换：比如 [1, 2, 3].includes('1') 返回 false。
                        // NaN：数组的 includes 可以正确判断 NaN，而 indexOf 不行。
                        (globalFriendInfoList[Number(item)]?.username.includes(searchValue) || globalFriendInfoList[Number(item)].username.includes(searchValue)) 
                        && (
                            <DisplayItem
                                key={item}
                                id={item}
                                title={globalFriendList[Number(item)] || globalFriendInfoList[Number(item)].username}
                                content={''}
                                isActive={activeFriend?.friend_id === Number(item)}
                                handleClick={() => handleFriendClick({ friend_id: Number(item), remark: globalFriendList[Number(item)] })}
                                avatar={globalFriendInfoList[Number(item)]?.avatar 
                                    ? `http://localhost:3007${globalFriendInfoList[Number(item)].avatar}` 
                                    : 'src/assets/images/defaultAvatar.jpg'}
                            />
                        )
                    )))
                    }
                </div>
            </div>
            {/* 右侧 */}
            <div className={directoryViewStyle.right}>
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