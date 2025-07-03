import chatViewStyle from './index.module.scss';
import { useState } from 'react';
function ChatView() {
    const [chatList, setChatList] = useState([]);
    return (
        <div className={chatViewStyle.chat_view_container}>
            {/* 左侧 */}
            <div className={chatViewStyle.chat_view_left}>
                {/* 左侧头部 */}
                <div className={chatViewStyle.chat_view_left_header}>
                    header
                </div>
                {/* 列表 */}
                <div className={chatViewStyle.chat_view_left_body}>
                    {
                        chatList.map((item, index) => (
                            <div key={index}> {item} </div>
                        ))
                    }
                </div>
            </div>
            {/* 右侧 */}
            <div className={chatViewStyle.chat_view_right}>
                
            </div>
        </div>
    )
}
export default ChatView;