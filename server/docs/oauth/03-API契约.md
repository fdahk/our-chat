# 03 · API 契约

> 全部端点的请求 / 响应 / 错误码。遵循 OAuth 2.1 + OIDC Core 1.0,所有错误响应符合 RFC 6749 §5.2 格式。

## 0. 通用约定

### 0.1 错误响应格式(RFC 6749 §5.2)

```json
{
  "error": "invalid_request",
  "error_description": "Missing required parameter: code",
  "error_uri": "https://docs.our-chat.com/oauth/errors#invalid_request"
}
```

错误码白名单(本系统使用):

| 错误码 | HTTP | 含义 |
|---|---|---|
| `invalid_request` | 400 | 缺少 / 重复 / 非法参数 |
| `invalid_client` | 401 | client_id 未注册或 client_secret 错 |
| `invalid_grant` | 400 | code 已用 / 已过期 / refresh 被撤销 / PKCE 验证失败 |
| `unauthorized_client` | 400 | client 没有此 grant_type 权限 |
| `unsupported_grant_type` | 400 | grant_type 不支持 |
| `invalid_scope` | 400 | 请求的 scope 超出 client 允许范围 |
| `access_denied` | 302(authorize) | 用户拒绝授权(暂未实现,预留) |
| `server_error` | 500 | 内部错误,details 不暴露 |
| `temporarily_unavailable` | 503 | 临时不可用 |

### 0.2 日志 / 审计

所有 OAuth 端点统一记录(见 [06-开发规范.md](./06-开发规范.md)):

```json
{
  "module": "oauth",
  "endpoint": "/oauth/token",
  "client_id": "our-chat-web",
  "user_id": 42,
  "grant_type": "authorization_code",
  "result": "success",
  "ip": "203.0.113.1",
  "user_agent": "Mozilla/5.0 ...",
  "timestamp": "2026-06-05T10:23:45.123Z"
}
```

---

## 1. `GET /.well-known/openid-configuration`(Discovery)

OIDC Discovery 1.0,允许客户端零配置。

### 响应

```json
{
  "issuer": "https://our-chat.example.com",
  "authorization_endpoint": "https://our-chat.example.com/oauth/authorize",
  "token_endpoint": "https://our-chat.example.com/oauth/token",
  "revocation_endpoint": "https://our-chat.example.com/oauth/revoke",
  "introspection_endpoint": "https://our-chat.example.com/oauth/introspect",
  "userinfo_endpoint": "https://our-chat.example.com/oauth/userinfo",
  "jwks_uri": "https://our-chat.example.com/.well-known/jwks.json",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "subject_types_supported": ["public"],
  "id_token_signing_alg_values_supported": ["RS256"],
  "token_endpoint_auth_methods_supported": ["client_secret_basic", "none"],
  "code_challenge_methods_supported": ["S256"],
  "scopes_supported": ["openid", "profile", "email", "agent-server"],
  "claims_supported": ["sub", "iss", "aud", "exp", "iat", "name", "email", "preferred_username"]
}
```

**生成方式**:`issuer` 等 URL 经 env `OAUTH_ISSUER_BASE_URL` 拼接,其他字段静态。

---

## 2. `GET /.well-known/jwks.json`

公钥发布,供 resource server 拉取验签。

### 响应

```json
{
  "keys": [
    {
      "kty": "RSA",
      "use": "sig",
      "alg": "RS256",
      "kid": "k-2026-06",
      "n": "x4...VeryLongBase64UrlEncodedModulus...Q",
      "e": "AQAB"
    }
  ]
}
```

- 一般只有一把活跃 kid;轮换期间会同时暴露新旧两把
- 私钥**永不出现**在响应里
- 建议设 `Cache-Control: public, max-age=600`(10 min),与 resource server 端缓存协调

---

## 3. `GET /oauth/authorize`

PKCE Authorization Code Flow 的授权端点。

### 请求参数(query string)

| 参数 | 必填 | 说明 |
|---|---|---|
| `response_type` | ✅ | 必须为 `code` |
| `client_id` | ✅ | 已注册的 client_id |
| `redirect_uri` | ✅ | 必须与 client 注册的某项 exact match |
| `scope` | ✅ | 空格分隔的 scope 列表 |
| `state` | ✅(强制) | 客户端生成的不可猜随机串,防 CSRF |
| `code_challenge` | ✅(public client 强制) | `base64url(SHA256(verifier))` |
| `code_challenge_method` | ✅ | 必须为 `S256` |
| `nonce` | ✅(当 scope 包含 `openid`) | 防 id_token 重放 |

### 流程

1. **校验 client_id + redirect_uri**:任一错 → 400,**不重定向**(防 open redirect)
2. **校验其他参数**:错 → 302 回 `redirect_uri?error=invalid_request&state=<echo>`
3. **检测登录态**:读 our-chat 现有 HttpOnly `token` cookie
   - 未登录:`302 /login?next=<encodeURIComponent(原 URL)>`,登录后由 login 路由跳回本端点
   - 已登录:走 4
4. **生成 code**(64 字节随机 base64url)+ 持久化 `oauth_codes` 行
5. **302 回 redirect_uri**:`?code=<C>&state=<echo>`

### 错误情况

| 错误 | 响应 |
|---|---|
| `client_id` 未注册 / `redirect_uri` 不匹配 | 400 直接渲染错误页,不重定向 |
| `response_type != 'code'` | 302 `redirect_uri?error=unsupported_response_type` |
| `code_challenge` 缺失(public client) | 302 `redirect_uri?error=invalid_request` |
| `code_challenge_method != 'S256'` | 302 `redirect_uri?error=invalid_request` |
| `scope` 超出 client 允许 | 302 `redirect_uri?error=invalid_scope` |
| `state` 缺失 | 302 `redirect_uri?error=invalid_request`(还是带 state 回去,但 state 为空) |

---

## 4. `POST /oauth/token`

Token 端点,统一处理两种 grant。

### 4.1 grant_type = `authorization_code`

#### 请求(`application/x-www-form-urlencoded`)

| 参数 | 必填 | 说明 |
|---|---|---|
| `grant_type` | ✅ | `authorization_code` |
| `code` | ✅ | 上一步拿到的 code |
| `redirect_uri` | ✅ | 必须与 `/authorize` 时一致 |
| `client_id` | ✅ | 跟 `/authorize` 时一致 |
| `client_secret` | confidential 必填 | confidential client 经 Basic Auth 也可 |
| `code_verifier` | public 必填 | PKCE 原始 verifier(43-128 字符) |

#### 响应(成功)

```json
{
  "access_token": "eyJhbGc...long.signed.JWT",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "eyJhbGc...refresh.JWT",
  "id_token": "eyJhbGc...id.JWT",
  "scope": "openid profile agent-server"
}
```

- `access_token`:RS256 JWT,`aud` 为请求 scope 对应的 resource server 集合
- `refresh_token`:RS256 JWT,`jti` 即 DB 主键
- `id_token`:仅 scope 含 `openid` 时返回(OIDC),包含用户身份信息

#### 校验步骤

1. 取 `code` 行;不存在 → `invalid_grant`
2. 校验 `used == 0`;`expires_at > NOW()`;否则 → `invalid_grant`
3. **立即 `UPDATE used = 1`**(防并发重放)
4. 校验 `redirect_uri` 一致;`client_id` 一致
5. 校验 PKCE:`base64url(SHA256(code_verifier)) === code.code_challenge`
6. 签 AT + RT,写 `oauth_refresh_tokens`
7. 返回

#### 错误

| 错误 | error |
|---|---|
| code 不存在 / 已用 / 过期 | `invalid_grant` |
| client_id 不存在 / disabled | `invalid_client` |
| confidential 但 client_secret 错 | `invalid_client` |
| public 但 code_verifier 缺失 / 不匹配 | `invalid_grant` |
| redirect_uri 跟 authorize 时不一致 | `invalid_grant` |

### 4.2 grant_type = `refresh_token`

#### 请求

| 参数 | 必填 | 说明 |
|---|---|---|
| `grant_type` | ✅ | `refresh_token` |
| `refresh_token` | ✅ | 当前持有的 RT |
| `client_id` | ✅ | 跟原 RT 的 client 一致 |
| `client_secret` | confidential 必填 | |
| `scope` | 可选 | 允许收缩 scope,不可扩展 |

#### 响应

跟 4.1 成功响应一致,但 `id_token` 不重发(仅 authorize 流给)。

#### 校验步骤

1. 验 RT 签名 + iss + exp(基本 JWT 校验)
2. SELECT by `jti`
3. **重用检测**:
   - 若 `revoked = 1` 或 `rotated_to IS NOT NULL` → **`invalid_grant` + 整 family 立即 invalidate**
4. 签新 AT + 新 RT(同 family_id)
5. UPDATE 旧 RT 的 `rotated_to`、`rotated_at`
6. INSERT 新 RT

#### 错误

| 错误 | error |
|---|---|
| RT 签名无效 / 过期 | `invalid_grant` |
| RT 已撤销 / 已被使用(reuse 检测命中) | `invalid_grant`(family 全杀,审计日志告警) |
| scope 请求超出原 scope | `invalid_scope` |

---

## 5. `POST /oauth/revoke`(RFC 7009)

撤销 RT 或 AT(可选)。

### 请求

| 参数 | 必填 | 说明 |
|---|---|---|
| `token` | ✅ | 要撤销的 token |
| `token_type_hint` | ✅ | `refresh_token` 或 `access_token` |
| `client_id` | ✅ | |
| `client_secret` | confidential 必填 | |

### 响应

`200 OK`(空 body)——无论 token 是否存在,**RFC 7009 §2.2 要求一致 200**,防探测

### 行为

- `token_type_hint = refresh_token`:UPDATE `revoked = 1`,reason = `'logout'`
- `token_type_hint = access_token`:本系统暂不维护 AT 黑名单(AT 短 TTL,等过期即可)。返回 200 但不实际撤销(符合 RFC 7009 行为,服务器可拒绝撤销 AT)

---

## 6. `POST /oauth/introspect`(RFC 7662)

Resource server 经此端点实时查询 token 状态。

### 请求

| 参数 | 必填 | 说明 |
|---|---|---|
| `token` | ✅ | 要查询的 token |
| `token_type_hint` | 可选 | |

**必须 confidential client + client_secret**(防探测)。

### 响应

```json
{
  "active": true,
  "scope": "openid profile agent-server",
  "client_id": "our-chat-web",
  "sub": "42",
  "exp": 1717593825,
  "iat": 1717592925,
  "iss": "https://our-chat.example.com",
  "aud": ["agent-server"]
}
```

或 `{ "active": false }`(token 无效 / 已撤销 / 已过期)。

### 行为

- AT:仅做签名 + exp 校验
- RT:还要查 DB 看 `revoked` 状态

---

## 7. `GET /oauth/userinfo`(OIDC Core)

返回当前用户的 standard claims。

### 请求

`Authorization: Bearer <access_token>`

### 响应

```json
{
  "sub": "42",
  "name": "Neo",
  "preferred_username": "neo",
  "email": "neo@example.com",
  "email_verified": true,
  "picture": "https://our-chat.example.com/uploads/avatar/42.jpg"
}
```

返回字段取决于 AT 的 `scope`:

- `openid` 必须 → `sub`
- `profile` → `name`、`preferred_username`、`picture`
- `email` → `email`、`email_verified`

---

## 8. Token JWT Claims

### 8.1 access_token claims

```json
{
  "iss": "https://our-chat.example.com",
  "sub": "42",
  "aud": ["agent-server"],
  "iat": 1717592925,
  "exp": 1717593825,
  "scope": "agent-server",
  "client_id": "our-chat-web",
  "jti": "at-7b9c...random"
}
```

- `aud`:**根据 scope 决定**——`scope: "agent-server"` → `aud: ["agent-server"]`;多个 resource → 数组
- `jti`:防重放(虽然 stateless,但便于日志关联)

### 8.2 refresh_token claims

```json
{
  "iss": "https://our-chat.example.com",
  "sub": "42",
  "aud": ["https://our-chat.example.com/oauth/token"],
  "iat": 1717592925,
  "exp": 1720184925,
  "scope": "openid profile agent-server",
  "client_id": "our-chat-web",
  "jti": "rt-9a3f...random",
  "family_id": "fam-2c8e..."
}
```

- `aud` 是 `/oauth/token` 端点本身——RT 只能拿来 refresh,不能拿去 resource server
- `family_id` 也写进 token,reuse 检测时双校验(DB + JWT)

### 8.3 id_token claims(OIDC)

```json
{
  "iss": "https://our-chat.example.com",
  "sub": "42",
  "aud": "our-chat-web",
  "iat": 1717592925,
  "exp": 1717596525,
  "auth_time": 1717592920,
  "nonce": "<from authorize>",
  "name": "Neo",
  "preferred_username": "neo",
  "email": "neo@example.com"
}
```

- `aud` 是 client_id,不是 resource server——id_token 是给 client 看的,不给 resource server
- `nonce` 必须与 /authorize 时的一致(由 client 校验,防重放)

---

## 9. 时间戳约定

- 全部 JWT claims `iat`/`exp` 使用 Unix 时间戳(秒)
- `clock_tolerance`:resource server 验签应允许 ± 30 秒漂移
- DB 字段 `DATETIME`,UTC(server timezone 设为 UTC)
