import styles from './style.module.scss';
import { useDispatch, useSelector } from 'react-redux';
import { getConversationMessages, updateConversationTime } from '@/globalApi/chatApi';
import type { RootState } from '@/store/rootStore';
import { useNavigate } from 'react-router-dom';
import { addConversation, addUserConversation, initActiveConversation, initGlobalMessages } from '@/store/chatStore';
import type { ApiResponse } from '@/globalType/apiResponse';
import type { Message } from '@/globalType/message';
import { useVoiceCall } from '@/hooks/useVoiceCall';
import {type CallUser } from '@/globalType/call';

interface FriendModalProps {
    style?: React.CSSProperties; //css原型
    avatar: string; // 定义类型可以用分号
    username: string;
    wxid: string;
    region: string;
    remark: string | null;
    gender: string;
}

function FriendModal({
    style,
    avatar,
    username,
    wxid,
    region,
    remark,
    gender,
}: FriendModalProps) {
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const userId = useSelector((state: RootState) => state.user.id);
    const globalConversations = useSelector((state: RootState) => state.chat.globalConversations);
    const { initiateCall } = useVoiceCall();
    // 点击发送消息
    const handleClickSendMessage = async () => {
        const conversationId = `single_${Math.min(userId, parseInt(wxid))}_${Math.max(userId, parseInt(wxid))}`;
        // 这里更新会话时间，保证会话列表中会话时间最新
        updateConversationTime({conversationId, userId}).then(res => {
            // 用户友好式更新
            //注：有些字段数据库实际是不需要的（为null），前端正常加，渲染时的逻辑用不到这些字段
            if(!globalConversations[conversationId as string]) {
                dispatch(addConversation({
                    id: conversationId,
                    conv_type: 'single',
                    title: username,
                    avatar: avatar,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                }))
                dispatch(addUserConversation({
                    id: '',
                    user_id: userId,
                    conversation_id: conversationId,
                    last_read_message_id: '',
                    unread_count: 0,
                    is_muted: 0,
                    is_pinned: 0,
                    is_archived: 0,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                }))
            }
        });
        // 获取会话消息
        await getConversationMessages(conversationId).then((res: ApiResponse<Message[]>) => {
            dispatch(initGlobalMessages(res.data ?? []));
        });
        // 设置当前会话
        dispatch(initActiveConversation(conversationId));
        navigate(`/chat`);        
    }
    
    // 点击语音聊天
    const handleClickVoiceChat = () => {
        const targetUser: CallUser = {
          id: parseInt(wxid),
          username: username,
          nickname: remark || username,
          avatar: avatar,
        };
      
        // 🔧 使用新的函数名
        initiateCall(targetUser);
      };
    // 点击视频聊天
    const handleClickVideoChat = () => {
        console.log('video chat');
    }
    return (
      <div className={styles.modalCard} style={style}>
        {/* 头部 */}
        <div className={styles.header}>
            {/* 头像 */}
            <img className={styles.avatar} src={avatar} alt="头像" />
            {/* 好友信息 */}
            <div className={styles.info}>
                <div className={styles.username}>
                    {username}
                    {gender === 'male' 
                    ? <i className={`iconfont icon-user ${styles.iconUser}`} /> 
                    : <i className={`iconfont icon-user ${styles.iconUser}`} style={{color: 'var(--warning-color)'}}/>}
                </div>
                <div className={styles.wxid}>微信号：{wxid}</div>
                <div className={styles.region}>地区：{region}</div>
          </div>
        </div>
        {/* 分割线 */}
        <div className={styles.line} />
        {/* 备注 */}
        <div className={styles.row}>
            <span className={styles.label}>备注</span>
            <span className={styles.value}>{remark || <span className={styles.addRemark}>点击添加备注</span>}</span>
        </div>
        {/* 底部选项 */}
        <div className={styles.footer}>
            <div className={styles.action} onClick={handleClickSendMessage}> 
                <i className={`iconfont icon-message`} />
                <span>发消息</span>
            </div>
            <div className={styles.action} onClick={handleClickVoiceChat}>
                <i className={`iconfont icon-phone`} />
                <span>语音聊天</span>
            </div>
            <div className={styles.action} onClick={handleClickVideoChat}>
                <i className={`iconfont icon-video`} />
                <span>视频聊天</span>
            </div>
            </div>
      </div>

  );
}

export default FriendModal;