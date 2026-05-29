# 04 · 修复 download() 绕过鉴权拦截器导致受保护文件下不动

> 类别：安全 / 正确性（鉴权头丢失）
> 涉及文件：`src/utils/http.ts`

## 一、问题概述

`http.ts` 里封装了统一的 axios 实例 `http`，它挂了**请求拦截器**（自动注入 `Authorization: Bearer <token>`）和**响应拦截器**（统一错误提示 + 401 自动刷新 token）。项目里的 `get/post/put/del/patch/upload` 都走这个实例。

唯独 `download()` 例外——它用的是**裸 `axios`**：

```ts
export const download = (url, filename?, config?) => {
  return axios.get<Blob>(`${API_BASE_URL}${url.startsWith('/') ? url : `/${url}`}`, {
    ...config,
    responseType: 'blob',
  }).then(({ data }) => { /* 造 <a> 触发下载 */ });
};
```

`axios`（全局默认实例）**没有**我们配置的那套拦截器，于是：

1. **不带 `Authorization` 头** → 下载受保护资源时后端返回 401，文件下不动；
2. **不享受 401 自动刷新** → token 刚过期时本可静默续期重试，这里直接失败；
3. **手动拼 `API_BASE_URL + url`** → 重复了实例 `baseURL` 已经做的事，还得自己处理前导斜杠，容易拼错。

## 二、概念扫盲：axios 实例 vs 全局 axios，拦截器挂在哪

- `axios` 是**默认实例**；`axios.create(config)` 返回一个**独立实例**。
- 拦截器（`interceptors.request/response.use`）是**挂在具体实例上**的。我们把拦截器挂在了 `http = axios.create(...)` 上，所以**只有用 `http` 发的请求**才会自动带 token、才会走 401 刷新。
- 用 `axios.get(...)`（默认实例）发请求，等于绕开了所有这些逻辑——它是"另一个客户端"。

这是 axios 封装里极常见的坑：**封装了实例，却在某个角落漏用了全局 `axios`**，导致这条链路"看起来一样、行为却不一致"。

## 三、修复

改为走 `http` 实例：

```ts
export const download = async (url, filename?, config?): Promise<void> => {
  const blob = (await http.get(url, { ...config, responseType: 'blob' })) as unknown as Blob;
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = filename || 'download';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(downloadUrl);
};
```

收益：自动带 `Authorization`、自动 401 刷新、`baseURL` 复用（不再手拼），行为与其它请求一致。

## 四、踩坑：响应拦截器把 AxiosResponse 解包成了 data

本项目的响应拦截器写的是 `return response.data`——它把 `AxiosResponse` 解包，只把 body 往下传。所以：

- 业务接口里拿到的是 `response.data`（已是后端 JSON）；
- blob 下载里 `http.get(..., {responseType:'blob'})` 解析出的 `response.data` 就是 **`Blob` 本体**。

但 axios 的 TS 类型仍按"未解包"声明为 `AxiosResponse<T>`，与运行时（实为 `T`/`Blob`）**对不上**。这是该封装的既有取舍（`get/post` 等导出函数也都用了 `as` 强转）。这里沿用同样手法：`(await http.get(...)) as unknown as Blob`，即"按运行时真实形状断言"。

> 更彻底的做法是让响应拦截器**不解包**、由各 helper 自己取 `.data`，类型就自洽了——但那是对整个 http 层的重构，超出本次单点修复范围，单独记账。

## 五、业界做法

- **单一出口**：所有 HTTP 都从同一个封装实例出去，杜绝散落的裸 `axios` / `fetch`。可加 lint（`no-restricted-imports` 限制直接 import `axios`）兜底。
- **下载也要鉴权**：受保护文件的下载同样需要带 token；若是大文件/需断点续传，再考虑后端签发**短时效签名 URL**（pre-signed URL），前端用普通 `<a href>` 直下，既鉴权又不占主线程。

## 六、验证

- `npx eslint src/utils/http.ts` 无报错；`pnpm build` 通过。
- `download()` 现经由 `http` 实例，请求自动携带 `Authorization`。

> 备注：`download()` 目前在代码里尚无调用方，属于工具层的潜伏 bug。趁早修正，避免将来接入下载功能时踩到"401 下不动"。
