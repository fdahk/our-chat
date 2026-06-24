// 编译期一致性校验:web 手写域类型的字段必须是 proto 生成契约的子集。
// 若 web 类型出现契约里没有的字段(拼写错、蛇形/驼峰漂移、私自加字段),此文件编译失败。
// 这是方案 B 下的"单一真相源"落地机制:proto 为权威,web 类型不得偏离。
// 注:字段值类型不在此校验(本项目 wire 约定 int64 id 序列化为 number,与生成类型的 string 不同)。
import type { MessageJson } from './gen/ourchat/message/v1/message_pb';
import type { UserJson } from './gen/ourchat/user/v1/user_pb';
import type {
  ConversationJson,
  UserConversationJson,
} from './gen/ourchat/conversation/v1/conversation_pb';
import type { FriendJson, FriendRequestJson } from './gen/ourchat/friend/v1/friend_pb';
import type { CallUserJson } from './gen/ourchat/call/v1/call_pb';
import type { Message } from '../globalType/message';
import type { User } from '../globalType/user';
import type { Conversation, UserConversation } from '../globalType/chat';
import type { Friend } from '../globalType/friend';
import type { CallUser } from '../globalType/call';
import type { FriendReq } from '../store/friendStore';

type AssertKeysSubset<Web, Contract> =
  Exclude<keyof Web, keyof Contract> extends never
    ? true
    : ['web 类型含契约外字段(疑似漂移):', Exclude<keyof Web, keyof Contract>];

export const _messageConforms: AssertKeysSubset<Message, MessageJson> = true;
export const _userConforms: AssertKeysSubset<User, UserJson> = true;
export const _conversationConforms: AssertKeysSubset<Conversation, ConversationJson> = true;
export const _userConversationConforms: AssertKeysSubset<UserConversation, UserConversationJson> = true;
export const _friendConforms: AssertKeysSubset<Friend, FriendJson> = true;
export const _friendRequestConforms: AssertKeysSubset<FriendReq, FriendRequestJson> = true;
export const _callUserConforms: AssertKeysSubset<CallUser, CallUserJson> = true;
