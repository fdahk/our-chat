// POST /oauth/agent-token
// 首方(first-party)令牌铸造:已登录的 our-chat 会话直接换一枚 agent-server-scoped
// access_token,免去 authorization_code + PKCE 的浏览器重定向往返。
//
// 安全前提:本端点挂在 authenticateToken 之后——只有持有效 our-chat 会话 cookie 的
// 请求才能进来,且变更类方法还过 CSRF 双提交校验(见 middleware/auth)。PKCE 是为
// 公有客户端在「重定向」场景防授权码截获而设;这里没有重定向、会话 cookie 已完成
// 用户认证,故按 BFF 模式直接铸造,是 OAuth 2.1 对首方场景的合理裁剪。
//
// 铸造出的仍是标准 RS256 access_token(aud=agent-server),agent-server 经 JWKS 验签 +
// 按 (iss,sub) 联合身份映射本地用户。IM 的消息核心(seq/ack/扩散)完全不参与。

import type { RequestHandler } from 'express';
import { audit, reqContext } from './audit.js';
import { newJti } from './storage.js';
import { signAccessToken, type IssuerConfig } from './tokens.js';
import type { KeyStore } from './keys.js';

interface MakeAgentTokenOptions {
  store: KeyStore;
  issuer: IssuerConfig;
  clientId?: string;
}

const AGENT_SCOPE = 'agent-server';

export function makeAgentTokenHandler(opts: MakeAgentTokenOptions): RequestHandler {
  const clientId = opts.clientId ?? 'our-chat-web';
  return async (req, res) => {
    const userId = req.user?.id;
    if (userId === undefined) {
      // authenticateToken 正常会拦下未登录,这里只是类型兜底。
      res.status(401).json({ success: false, message: '未登录' });
      return;
    }
    try {
      const at = await signAccessToken(opts.store, opts.issuer, {
        sub: userId,
        scope: AGENT_SCOPE,
        client_id: clientId,
        jti: newJti('at'),
      });
      audit({
        event: 'agent_token_issued',
        client_id: clientId,
        user_id: userId,
        scope: AGENT_SCOPE,
        ...reqContext(req),
      });
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Pragma', 'no-cache');
      res.json({ access_token: at.token, token_type: 'Bearer', expires_in: at.expiresIn });
    } catch (err) {
      console.error('agent-token 铸造失败:', err);
      res.status(500).json({ success: false, message: 'agent-token 铸造失败' });
    }
  };
}
