# 11 · socket.io 握手鉴权与服务端派生身份

> 类别：安全（实时通信鉴权 / 越权）
> 涉及文件：`server/src/utils/socket.js`、`web/src/utils/socket.ts`
> 关联：本次鉴权 cookie 化（见 [报告 10](./10-HttpOnly-cookie-与-CSRF-双提交鉴权迁移.md)）让 WebSocket 握手能复用同一套 HttpOnly cookie，是本修复的前提。

## 一、漏洞本体：零鉴权的实时通道

改造前，socket.io 服务端**对连接不做任何身份校验**，且**完全信任客户端自报的 `userId`**：

```js
// 旧逻辑（示意）
io.on('connection', (socket) => {
  socket.on('join', (userId) => socket.join(userId));      // 客户端说自己是谁就加谁的房间
  socket.on('sendMessage', async (msg) => {
    // 直接用 msg.senderId，从不校验是不是本人
    io.to(user1).emit('receiveMessage', savedMsg);
  });
});
```

这意味着任何人——**甚至未登录者**——只要连上 socket，就能：

1. **`join` 任意 userId 的房间**，从而**实时接收他人的所有私聊消息**（监听他人会话）。
2. **伪造 `senderId` 冒充任意用户发消息**（伪造身份发言）。
3. 通话信令（`call:*`）同样可被任意构造，骚扰/劫持他人通话。

这是比 localStorage 存 token 更严重的漏洞：前者要先打中一次 XSS，后者**直接裸奔**——HTTP 接口都过鉴权中间件了，WebSocket 这条平行通道却是一扇没锁的后门。

## 二、概念扫盲

### 2.1 socket.io 的握手（handshake）
WebSocket 连接的建立，是先发一个**普通 HTTP 请求**带 `Upgrade: websocket` 头，服务端同意后再"升级"为长连接。这个升级请求就叫**握手**。关键点：**握手是 HTTP 请求，浏览器会自动带上同源/同站的 cookie**——这正是 cookie 鉴权能无缝覆盖 WebSocket 的原因。

### 2.2 `io.use()`— 握手中间件
socket.io 提供 `io.use((socket, next) => {...})`，在**连接建立之前**对每个握手执行。`next(err)` 传入错误即**拒绝连接**。这是做握手鉴权的标准位置——校验不过的连接根本进不来，而不是连上之后再赶。

### 2.3 "服务端派生身份" vs "信任客户端自报"
**核心安全原则：身份必须由服务端从可信凭据推导，绝不能采信客户端发来的"我是谁"。** 客户端能发任意字段，`userId: 999` 谁都能写。正确做法是：从握手 cookie 里取出 JWT → 验签 → 取出 `decoded.id` 作为权威身份，挂到 `socket.userId`。后续一切都用这个服务端派生的值，客户端自报的 id 只用于"和服务端值比对是否一致"，不作数据来源。

## 三、实现

### 3.1 握手鉴权（`socket.js`）
```js
io.use((socket, next) => {
  try {
    const token = parseCookie(socket.handshake.headers.cookie, TOKEN_COOKIE);
    if (!token) return next(new Error('未认证：缺少登录凭据'));
    const decoded = jwt.verify(token, config.jwtSecret);   // 验签
    socket.userId = decoded.id;                             // 权威身份，挂到连接上
    next();
  } catch {
    next(new Error('认证失败：登录凭据无效或已过期'));
  }
});
```
- 从 `socket.handshake.headers.cookie` 里用手写的 `parseCookie` 取出 HttpOnly 的 token（socket.io 不自动解析 cookie，需手动从握手头里抠）。
- `jwt.verify` 验签——伪造/篡改/过期的 token 全部在此被拒，连接根本建立不起来。

### 3.2 连接即加入自己的房间，`join` 忽略传参
```js
io.on('connection', (socket) => {
  socket.join(socket.userId);          // 自动加入「自己」的房间，房间号取服务端派生的 userId
  socket.on('join', () => socket.join(socket.userId)); // 兼容旧前端的 join，但忽略其参数
});
```
彻底切断"join 任意房间"：房间号永远是服务端验签得到的 `socket.userId`，客户端传什么都没用。

### 3.3 发消息防伪造
```js
socket.on('sendMessage', async (msg) => {
  if (Number(msg.senderId) !== Number(socket.userId)) {   // 发送者必须是本人
    socket.emit('error', { message: '非法的发送者身份' });
    return;
  }
  ...
});
```
`senderId` 仍从消息体取（兼容现有数据结构），但**强制等于服务端身份**，对不上直接拒。`Number()` 归一化避免字符串/数字类型不一致导致的误判。

### 3.4 前端（`socket.ts`）
仅一处：连接 options 加 `withCredentials: true`，让握手请求带上 HttpOnly cookie。前端**不再手动传 userId/token 给 socket**——身份完全由后端从 cookie 派生。

## 四、取舍

| 方案 | 说明 | 取舍 |
|------|------|------|
| **握手 cookie 验签（本次）** | 复用 HTTP 同一套 HttpOnly cookie，握手时验 | 与 cookie 鉴权统一、token 不经 JS，最省事 |
| `socket.auth` 字段传 token | 前端把 token 塞进 `io(url,{auth:{token}})` | token 又回到 JS 可读，违背报告 10 的迁移目的 |
| query string 带 token | `io(url+'?token=')` | token 进 URL，易被日志/Referer 泄露，最差 |

cookie 化之后，握手验签是顺理成章的最优解——这也是报告 09 第 9.5 节"cookie 方案天然适配 socket.io"的兑现。

**为什么不在每条消息上再验一次 token？** 握手时验一次、把身份固化到 `socket.userId` 即可；连接是有状态长连接，身份在连接生命周期内不变。逐条验签是无谓开销。token 过期的处理交给 HTTP 侧的刷新机制，长连接可在重连时重新握手鉴权。

## 五、踩坑记录

1. **socket.io 不自动解析 cookie**。HTTP 侧有 `cookie-parser`，但 socket 握手得自己从 `handshake.headers.cookie` 字符串里解析，需注意 `decodeURIComponent` 和 `=` 只 split 第一个（cookie 值里可能含 `=`）。
2. **房间号类型必须一致**。现有广播用 `io.to(parseInt(user1))`（数字），所以 `socket.join(socket.userId)` 也保持 `decoded.id` 的数字类型，否则 `join('5')` 和 `to(5)` 匹配不上，消息发不到。
3. **CORS 凭据**：socket.io 的 cors 也要 `credentials:true` 且 origin 不能用 `*`，否则浏览器握手时不带 cookie（与 HTTP 侧同理，见报告 13）。
4. **`io.use` 里 `next(new Error(...))` 才是拒绝**，直接 `return` 或抛出未捕获异常行为不对；错误信息会传到前端 `connect_error` 事件。

## 六、业界对比与 Web vs Native

- **业界**：握手期鉴权（authenticate at handshake）是 socket.io 官方推荐模式；"绝不信任客户端自报身份、服务端从已验证凭据派生"是所有实时系统（IM、协同编辑、游戏服务器）的通用铁律。房间/频道授权应在 join 时由服务端校验权限，而非任由客户端 join。
- **Web vs Native**：原生 App 的长连接同样要握手鉴权，但凭据通常放自定义握手头或首帧认证消息（原生不受 cookie/同源限制，也无浏览器自动携带机制）。Web 的优势恰恰是能复用浏览器的 cookie 自动携带，握手即带凭据；劣势是要处理 CORS 凭据与 SameSite。无论 Web 还是 Native，"服务端派生身份"这条原则完全一致——区别只在凭据怎么传到握手这一步。

## 七、验证与局限

- 后端 `node --check src/utils/socket.js` 通过；前端 `pnpm build` / `pnpm lint` 通过。
- **未做端到端运行验证**：需起完整后端 + MongoDB（消息持久化）+ MySQL（会话表）联调收发与越权拒绝。伪造 `senderId`、join 他人房间应被拒绝的负向用例，留待完整环境补测。
