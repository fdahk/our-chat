# 07 · 集成指南 · agent-server(Resource Server)

> 给 agent-server 后端工程师看的接入指南。本文档约定的契约稳定后,**agent-server 端实现完全独立**——可以更换 Web 框架 / 语言而 OAuth 集成代码逻辑不变。

## 1. 你需要做的全部事情

1. 在 `package.json` 加 `jwks-rsa` 依赖
2. 改 `JwtStrategy`(从 HS256 + shared secret → RS256 + JWKS)
3. 加 4 个 env 变量
4. 加一份集成测试

总改动 ~ 30 行。

## 2. 代码改动

### 2.1 依赖

```bash
pnpm add jwks-rsa
```

### 2.2 `src/modules/auth/jwt.strategy.ts`

```ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';

export interface AuthedUser {
  userId: number;
  username: string;
  scope: string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // 公钥经 our-chat 的 JWKS 端点拉取,自动缓存 + 限流
      secretOrKeyProvider: passportJwtSecret({
        jwksUri: process.env.OAUTH_JWKS_URI!,
        cache: true,
        cacheMaxAge: 10 * 60 * 1000,    // 10 min
        rateLimit: true,
        jwksRequestsPerMinute: 10,
      }),
      algorithms: ['RS256'],
      audience: process.env.OAUTH_AUDIENCE!,    // 'agent-server'
      issuer: process.env.OAUTH_ISSUER!,        // 'https://our-chat.example.com'
      // 容忍 30 秒时钟漂移
      clockTolerance: 30,
    });
  }

  validate(payload: any): AuthedUser {
    // payload 已经过 RS256 验签 + aud + iss + exp 校验
    return {
      userId: Number(payload.sub),
      username: payload.preferred_username ?? '',
      scope: (payload.scope ?? '').split(' ').filter(Boolean),
    };
  }
}
```

### 2.3 Env

```bash
# .env
OAUTH_JWKS_URI=https://our-chat.example.com/.well-known/jwks.json
OAUTH_AUDIENCE=agent-server
OAUTH_ISSUER=https://our-chat.example.com
```

### 2.4 集成测试(`test/integration/oauth-jwks.integration.test.ts`)

测试用例:

1. **happy path**:用 our-chat 签的真实 token 调 protected endpoint → 200
2. **过期 token**:exp < now → 401
3. **错 aud**:`aud: 'other-server'` → 401
4. **错 iss** → 401
5. **签名无效**(用别的私钥签同 payload) → 401
6. **JWKS pull 失败**(IdP 离线):预期使用缓存的旧公钥,如果完全没缓存则 503

## 3. JWT 载荷约定

agent-server 拿到的 access_token payload:

```json
{
  "iss": "https://our-chat.example.com",
  "sub": "42",
  "aud": ["agent-server"],
  "exp": 1717593825,
  "iat": 1717592925,
  "scope": "agent-server",
  "client_id": "our-chat-web",
  "jti": "at-7b9c..."
}
```

**关键字段使用**:

- `sub`:**字符串形式**的用户 ID,resource server 自行 `Number(sub)` 转
- `scope`:空格分隔字符串,本字段决定 client 拿这个 token 能做什么
- `aud`:数组,resource server 必须验证 `'agent-server'` ∈ `aud`
- `client_id`:debug / 审计用,标识"用户经哪个 client 拿到这个 token"

## 4. 用户首次接入(JIT user provisioning)

如果 agent-server 自有 `User` 表,token 里的 `sub`(our-chat 的 user ID)第一次出现时:

```ts
const user = await this.userRepo.findOne({ where: { ourChatId: sub } });
if (!user) {
  // 新建一行,镜像 our-chat 用户信息
  await this.userRepo.create({
    ourChatId: sub,
    username: payload.preferred_username,
    createdAt: new Date(),
  });
}
```

这是 OAuth 集成的标准 "Just-In-Time provisioning" 模式。

**或者**:agent-server 干脆不存 user 表,所有用户态都用 `sub` 当主键查询(如 `Document.userId = sub` 直接存数字)。本项目当前采用此方案——agent-server 的 user 表实际只是镜像 our-chat。

## 5. JWKS 缓存 / 失效场景

| 场景 | 行为 |
|---|---|
| 启动时 our-chat 不在 | `jwks-rsa` 会在第一次需要验签时再去拉,失败时 401 |
| 运行中 our-chat 短暂不可达 | 缓存内 token 验证正常,缓存外的会 401 |
| 密钥轮换(双 kid 共存) | JWKS 返回多 kid,`jwks-rsa` 按 token header 的 kid 选 |
| 缓存过期 | 自动重新拉 |

**生产建议**:

- our-chat 服务高可用部署
- JWKS endpoint 经 CDN / nginx 静态缓存,完全独立于 our-chat 主进程的可用性
- agent-server 监控:JWKS 拉取失败率 alarm

## 6. 用户登出 / token 撤销的响应

| 场景 | agent-server 行为 |
|---|---|
| 用户在 our-chat 登出 | our-chat 撤销 RT,agent-server **AT 仍有效到 exp**(短 TTL,15 min) |
| 想要立即失效 | 可选实现 introspection 中间件(每次请求查 our-chat 的 `/oauth/introspect`)——本项目不上,因为引入 1 跳延迟 |
| 怀疑 token 被偷 | our-chat 管理员触发 `UPDATE oauth_refresh_tokens SET revoked = 1 WHERE user_id = ?` + 通知 |

## 7. 安全契约

agent-server 承诺:

- 永远不持有 our-chat 私钥
- 永远不向 our-chat 学习以外的 issuer 接受 token
- 永远不允许 `algorithm: 'none'`(passport-jwt + `algorithms: ['RS256']` 已强制)
- 永远校验 `aud` 包含 `'agent-server'`

our-chat 承诺:

- JWKS endpoint 高可用,SLA ≥ 99.9%
- 密钥轮换前给 resource server ≥ 24h 公告期
- 紧急轮换通知接入方
