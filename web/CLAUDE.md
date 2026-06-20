# web/ — React Web 端（先读根 CLAUDE.md）

栈：React + Redux Toolkit + react-redux + redux-persist + antd + axios + socket.io-client + i18next + react-router-dom + crypto-js。

## 命令
- 开发 `npm start`｜构建 `npm run build`｜lint `npm run lint`｜测试 `npm test` / `test:coverage`｜性能 `npm run lhci` / `size`

## 要点
- 服务端状态 + 实时：socket.io-client + RTK；UI 用 antd。
- 渲染三态：list/集合必须覆盖 loading / empty / error，empty 不能长得像 error。
- 完工门禁：`npm run lint && npm test`
