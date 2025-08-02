import directoryViewStyle from './style.module.scss';
import { useEffect, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import FriendModal from '@/globalComponents/friendModal';
import type { RootState } from '@/store/rootStore';
import DisplayItem from '@/globalComponents/displayItem';
import SearchModal from '@/globalComponents/searchModal';
import { searchUser, replyFriendReq } from '@/globalApi/friendApi';
import AddFriendModal from '@/globalComponents/addFriendModal';
import { setFriendReqStatus } from '@/store/friendStore';
import {type Message } from '@/globalType/message';
import SocketService from '@/utils/socket';
import { addGlobalFriend, addGlobalFriendInfo } from '@/store/chatStore';
function DirectoryView() {
    const [activeFriend, setActiveFriend] = useState<{ friend_id: number, remark: string | null } | null>(null);
    const globalFriendList = useSelector((state: RootState) => state.chat.globalFriendList);
    const globalFriendInfoList = useSelector((state: RootState) => state.chat.globalFriendInfoList);
    const globalFriendReqList = useSelector((state: RootState) => state.friendReq);
    const dispatch = useDispatch();
    const userId = useSelector((state: RootState) => state.user.id);
    const [isCheckingFriendReq, setIsCheckingFriendReq] = useState(false);
    const socket = SocketService.getInstance();
    // 点击好友
    const handleFriendClick = (friend: { friend_id: number, remark: string | null }) => {
        setIsCheckingFriendReq(false);
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
        if(isCheckingFriendReq) setIsCheckingFriendReq(false);
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
    // 点击新朋友卡片
    const handleClickNewFriend = () => {
        setActiveFriend(null);
        setIsCheckingFriendReq(true);
    }
    // 回复好友请求
    const handleReplyFriendReq = async (friend_id: number, status: string) => {
        replyFriendReq({userId, friend_id, status}).then( async () => {
            dispatch(setFriendReqStatus({friend_id, status}));
            if(status === "accepted") {
                const otherInfo = await searchUser({keyword: friend_id, userId});
                const conversationId = `single_${Math.min(userId, friend_id)}_${Math.max(userId, friend_id)}`;                
                // 创建会话记录
                
                // 创建初始消息 
                const msg:Message = {
                    conversationId: conversationId,
                    senderId: friend_id, 
                    content: '你好，我是' + otherInfo.data.friendInfo.username,
                    type: 'text',
                    status: 'sent',
                    mentions: [],
                    isEdited: false,
                    isDeleted: false,
                    extra: {},
                    editHistory: [],
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    timestamp: new Date().toISOString(),
                };
                socket.emit('sendMessage', msg);
                // 更新好友列表
                dispatch(addGlobalFriend({friend_id, remark: null}));
                dispatch(addGlobalFriendInfo({friend_id, friendInfo: {
                    username: otherInfo.data.friendInfo.username,
                    avatar: otherInfo.data.friendInfo.avatar,
                    gender: otherInfo.data.friendInfo.gender,
                }}));
            }
        })
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
    // TSX
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
                            <>
                                <DisplayItem
                                    id={''}
                                    avatar={'src/assets/images/newFriend.png'}
                                    title={'新朋友'}
                                    content={''}
                                    handleClick={handleClickNewFriend}
                                />
                                {Object.keys(globalFriendList)
                                    .filter(item => {
                                        const friendInfo = globalFriendInfoList[Number(item)];
                                        return friendInfo?.username.includes(searchValue) && globalFriendReqList[Number(item)].status === 'accepted';
                                    })
                                    .map((item: string) => {
                                        const friendId = Number(item);
                                        const friendInfo = globalFriendInfoList[friendId];
                                        
                                        return (
                                            <DisplayItem
                                                key={item}
                                                id={item}
                                                title={globalFriendList[friendId] || friendInfo?.username}
                                                content={''}
                                                isActive={activeFriend?.friend_id === friendId}
                                                handleClick={() => handleFriendClick({ 
                                                    friend_id: friendId, 
                                                    remark: globalFriendList[friendId] 
                                                })}
                                                avatar={friendInfo?.avatar 
                                                    ? `http://localhost:3007${friendInfo.avatar}` 
                                                    : 'src/assets/images/defaultAvatar.jpg'}
                                            />
                                        );
                                    })}
                            </>
                        )
                    }
                </div>
            </div>
            {/* 右侧 */}
            <div className={directoryViewStyle.right}>
                {/* 好友信息 */}
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
                {/* 检查新朋友 */}
                {isCheckingFriendReq && (
                    <div className={directoryViewStyle.friendReqBox}>
                        <div className={directoryViewStyle.friendReqHeader}>
                            <p className={directoryViewStyle.title}>新的朋友</p>
                        </div>
                        <div className={directoryViewStyle.friendReqList}>
                            {
                                Object.keys(globalFriendReqList).map((item: string) => {
                                    const friendInfo = globalFriendInfoList[Number(item)];
                                    return (
                                        <div className={directoryViewStyle.friendReqItem} key={item}>
                                            <DisplayItem 
                                            id={item} title={friendInfo?.username} content={''} 
                                            avatar={friendInfo?.avatar 
                                            ? `http://localhost:3007${friendInfo.avatar}` 
                                            : 'src/assets/images/defaultAvatar.jpg'} 
                                            style={{width: '55px', height: '55px', backgroundColor: 'transparent'}}/>
                                            {/* 请求状态 */}
                                            <div className={directoryViewStyle.rightBox}>
                                                {
                                                    globalFriendReqList[Number(item)].status === 'pending'
                                                    ? (
                                                    <div className={directoryViewStyle.rightBox_btn}>
                                                        <div className={directoryViewStyle.rightBox_btn_reject} 
                                                        onClick={() => handleReplyFriendReq(Number(item), 'blocked')}>
                                                            拒绝
                                                        </div>

                                                        <div className={directoryViewStyle.rightBox_btn_accept} 
                                                        onClick={() => handleReplyFriendReq(Number(item), 'accepted')}>
                                                            同意
                                                        </div>
                                                    </div>            
                                                    )
                                                    : (
                                                        <div className={directoryViewStyle.rightBox_status}>
                                                            {
                                                                globalFriendReqList[Number(item)].status === 'sent'
                                                                ? <p>等待验证</p>
                                                                : <p>{globalFriendReqList[Number(item)].status === 'accepted' ? '已同意' : '已拒绝'}</p>
                                                            }
                                                        </div>
                                                    )
                                                }
                                            </div>
                                        </div>
                                    );
                                })
                            }                            
                        </div>

                    </div>
                )}
            </div>
        </div>
    )
}

export default DirectoryView;