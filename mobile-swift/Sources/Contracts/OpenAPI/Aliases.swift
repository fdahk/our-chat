import Foundation

// OpenAPI 生成类型的简称(单一契约源 openapi/openapi.yaml → swift-openapi-generator)。
// 业务层用这些别名替代手写 DTO,字段与线上 JSON 一一对应,跨端共享同一契约。
typealias APIUser = Components.Schemas.User
typealias APILoginData = Components.Schemas.LoginData
typealias APIMessage = Components.Schemas.Message
typealias APIMessagePreview = Components.Schemas.MessagePreview
typealias APIFileInfo = Components.Schemas.FileInfo
typealias APIConversation = Components.Schemas.Conversation
typealias APIUserConversation = Components.Schemas.UserConversation
typealias APIFriendList = Components.Schemas.FriendList
typealias APIFriendInfo = Components.Schemas.FriendInfo
typealias APISearchUserResult = Components.Schemas.SearchUserResult
typealias APIFriendRequest = Components.Schemas.FriendRequest
typealias APIUploadResult = Components.Schemas.UploadResult
