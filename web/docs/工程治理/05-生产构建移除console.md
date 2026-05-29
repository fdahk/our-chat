# 05 · 生产构建移除 console / debugger

> 类别：性能（体积）+ 安全（信息泄露纵深防御）
> 涉及文件：`vite.config.ts`

## 一、问题概述

全项目源码里有 **160+ 处 `console.*`**（`webrtc.ts` 一个文件就几十处，记录 SDP 协商、ICE 状态、连接细节）。它们原样进了生产包，带来三类问题：

1. **体积**：每一处 `console.log('...', obj)` 都是要打包、要下载、要解析执行的字节。
2. **运行开销**：热路径（如 WebRTC 状态回调、消息处理）里的 console 在生产环境持续执行、序列化参数，纯属浪费。
3. **信息泄露**：暴露内部状态、数据结构、接口字段，给攻击者做信息收集；若接了 Sentry/LogRocket 等会话回放，console 内容还会被上传第三方（详见报告 03）。

## 二、修复：让 esbuild 在生产构建时静态删除

Vite 的转译器和默认压缩器都是 **esbuild**，它有个 `drop` 选项能在编译期直接删掉指定语句：

```ts
export default defineConfig(({ command }) => ({
  esbuild: {
    drop: command === 'build' ? ['console', 'debugger'] : [],
  },
  // ...
}));
```

- `drop: ['console']`：删除所有 `console.*` 调用；`'debugger'`：删除 `debugger` 断点语句。
- **关键是用函数式配置拿到 `command`**：只在 `command === 'build'`（即 `vite build`）时 drop；`vite serve`（本地开发）时为 `[]`，**开发调试照常打印**。
- 效果是**静态删除**（不是运行时跳过）：语句连同参数表达式一起从产物里消失。

> 验证：`pnpm build` 后 `grep -o 'console\.\(log\|error\|...\)' dist/assets/*.js | wc -l` 结果为 **0**（连第三方依赖里的 console 也被一并 drop）；主 JS 体积小幅下降。

## 三、概念扫盲：drop 和 tree-shaking / minify 的关系

- **minify（压缩）**：删空白、改短变量名，不改变语义。它**不会**主动删 `console.log`，因为那是有"副作用"的调用，压缩器默认不敢动。
- **drop**：明确告诉 esbuild "这些调用视为无副作用，可以删"。这是专门的开关，不是压缩的副产物。
- **tree-shaking**：删的是"没人引用的导出/模块"，针对的是死代码，也管不到 `console.log` 这种"被调用了的语句"。

所以三者各管一摊，移除 console 必须靠 `drop`（或 terser 的 `drop_console`）。

## 四、取舍：要不要连 `console.error` / `console.warn` 一起删？

| 方案 | 配置 | 取舍 |
|------|------|------|
| 全删（本次采用） | `drop: ['console']` | 体积/泄露最优。代价:生产没有任何 console 输出 |
| 只删 log/info/debug，留 error/warn | esbuild `pure: ['console.log','console.info','console.debug']` 或 terser `pure_funcs` | 保留生产报错可见性，但 error 对象常含敏感上下文(见报告 03 里 axios error 含密码),留着仍有泄露面 |

选**全删**，因为：

1. **生产环境没人盯着用户的浏览器控制台**——`console.error` 在生产几乎没有观测价值；
2. 真要做生产错误监控，正确工具是 **Sentry 等错误上报 SDK**（结构化、可聚合、可告警），它通过自己的 API 收集，不依赖 console，因此 drop console **不影响**这类 SDK；
3. 保留 `console.error` 反而把"含密码的 axios error"留在了产物里，与报告 03 的治理目标冲突。

## 五、为什么这和报告 03（源头删敏感日志）不重复——纵深防御

- 报告 03：**源头**删掉显式打印密码/token 的语句 → 治本，且覆盖**开发/预发**环境。
- 本报告 05：**构建期**兜底删掉**所有** console → 覆盖那些"非敏感但冗余"的日志，以及"漏网的"敏感日志，**只在生产**生效。

两层叠加：源头不写敏感数据 + 生产不输出任何 console。任一层失守，另一层仍在。

## 六、业界做法

- **Vite/esbuild**：`esbuild.drop`（本次）。
- **webpack + terser**：`terserOptions.compress.drop_console = true`。
- **Babel**：`babel-plugin-transform-remove-console`。
- 进阶：用 `pure_funcs` 精细控制保留哪几个 console 级别；或干脆全 drop + 接 Sentry。

## 七、验证

- `pnpm build` 通过；生产产物 `console.*` 计数为 0；`debugger` 同样清零。
- `vite serve`（开发）下 console 正常输出，不影响本地调试。
