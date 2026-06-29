// OpenAPI 生成 schema 的具名再导出(单一契约源 openapi/openapi.yaml → openapi-typescript)。
// 业务层从这里取 REST 实体类型,与 iOS(swift-openapi-generator)/gateway(oapi-codegen)共享同一契约。
import type { components } from './schema';

export type User = components['schemas']['User'];
export type AuthUser = components['schemas']['AuthUser'];
export type Friend = components['schemas']['Friend'];
export type FriendInfo = components['schemas']['FriendInfo'];
export type Message = components['schemas']['Message'];
export type FileInfo = components['schemas']['FileInfo'];
export type Conversation = components['schemas']['Conversation'];
export type UserConversation = components['schemas']['UserConversation'];
export type FriendRequest = components['schemas']['FriendRequest'];
export type FriendList = components['schemas']['FriendList'];
export type SearchUserResult = components['schemas']['SearchUserResult'];
export type UploadResult = components['schemas']['UploadResult'];
