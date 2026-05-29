// 统一导出静态图片资源。
// 用 ES import 而非硬编码 'src/assets/...' 字符串路径:
// Vite 会把这些 import 解析成构建后带 hash 的真实 URL,生产环境才取得到;
// 硬编码字符串在生产(乃至 dev 的子路由下)会 404。
import defaultAvatar from './defaultAvatar.jpg';
import searchUserIcon from './searchUser.png';
import newFriendIcon from './newFriend.png';

export { defaultAvatar, searchUserIcon, newFriendIcon };
