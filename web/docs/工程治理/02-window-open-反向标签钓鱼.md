# 02 · 修复 window.open 反向标签钓鱼（reverse tabnabbing）

> 类别：安全（钓鱼防护）
> 涉及文件：`src/views/chatView/index.tsx`

## 一、问题概述

聊天里点击图片消息会新开标签页预览：

```tsx
onClick={() => window.open(buildServerUrl(fileUrl), '_blank')}
```

`window.open(url, '_blank')` 在**没有指定** `noopener` 的情况下，新打开的页面能通过 `window.opener` 反向拿到**打开它的那个页面（也就是我们的聊天应用）的 window 引用**，并执行：

```js
window.opener.location = 'https://phishing.example/fake-login';
```

把**原标签页**悄悄导航到钓鱼页。这类攻击叫 **reverse tabnabbing（反向标签钓鱼）**。

## 二、攻击链路：为什么聊天应用尤其危险

1. 用户在会话里收到一张"图片"（`fileUrl` 来自消息，攻击者可控——他能把 `fileUrl` 指向自己的页面，或上传一个会跳转的 HTML/SVG）。
2. 用户点击 → `window.open(攻击者URL, '_blank')` 打开新标签。
3. 新标签里的脚本拿到 `window.opener`，把**原来那个聊天标签**重定向到一个**和真站点一模一样的假登录页**。
4. 用户处理完新标签转回来，看到"会话过期，请重新登录"，毫无戒心地输入账号密码——密码进了攻击者口袋。

危险点在于：用户的注意力在**新标签**，而被篡改的是**旧标签**，整个过程旧标签没有任何视觉提示。聊天应用的 `fileUrl` 是用户间传递的、攻击者可控的内容，正好满足触发条件。

## 三、概念扫盲：`window.opener` 与跨源的边界

- `window.opener` 是新页面指向"开启者"的引用。**即使新页面与开启者跨源（cross-origin）**，出于历史原因，新页面仍被允许**写** `opener.location`（导航是少数被放行的跨源操作之一）。它读不到 opener 的 DOM/cookie，但"把你导走"已经足够做钓鱼。
- `noopener`：让 `window.open` 返回的新窗口的 `opener` 为 `null`，切断这条反向引用。
- `noreferrer`：额外不发送 `Referer` 头，也隐含 `noopener` 的效果。一起加更稳妥，还能避免把当前页 URL（可能含敏感 query）泄露给目标站。

## 四、修复

```tsx
window.open(buildServerUrl(fileUrl), '_blank', 'noopener,noreferrer');
```

第三个参数 `windowFeatures` 里加上 `noopener,noreferrer` 即可。新标签的 `window.opener === null`，反向导航链路被切断。

## 五、各种写法的对照与取舍

| 场景 | 推荐写法 | 说明 |
|------|----------|------|
| `<a target="_blank">` | `rel="noopener noreferrer"` | 现代浏览器对 `target=_blank` 已**默认隐含 noopener**（Chrome 88+/FF 79+/Safari 12.1+），但显式写上兼容老内核、表达意图 |
| `window.open(...)` | 第三参 `'noopener,noreferrer'` | **`window.open` 没有"默认 noopener"这回事**，必须手动加——这正是本次的坑 |
| 需要保留 opener（如自家弹窗回调） | 不要加 noopener，改用 `postMessage` 通信 | 仅在确信目标可信时 |

注意一个常见误区：很多人以为"现代浏览器都默认安全了"，但那只针对 `<a target="_blank">` 标签，**`window.open()` 调用不在此列**。本项目用的恰好是 `window.open`，所以必须显式加。

## 六、业界做法

- **React/JSX lint**：`eslint-plugin-react` 的 `react/jsx-no-target-blank` 规则会在 `<a target="_blank">` 缺 `rel` 时报错（但管不到 `window.open`，需人工把关或自定义规则）。
- **统一封装**：成熟项目会封装 `openExternal(url)`，内部固定带 `noopener,noreferrer`，杜绝散落各处的裸 `window.open`。若本项目后续多处需要外链打开，可考虑收敛到 `utils` 里一个函数（当前仅一处，先就地修复，避免过度抽象）。

## 七、验证

- 修改后点击图片消息，新标签内 `window.opener` 为 `null`（控制台验证 `window.opener`）。
- `pnpm build` 通过。
