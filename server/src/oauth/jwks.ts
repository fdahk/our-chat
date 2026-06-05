// GET /.well-known/jwks.json
// 公钥发布,resource server 拉取验签;响应内容启动时已构造好,这里只读

import type { RequestHandler } from 'express';
import { buildJwksResponse, type KeyStore } from './keys.js';

export function makeJwksHandler(store: KeyStore): RequestHandler {
  const body = buildJwksResponse(store);
  const serialized = JSON.stringify(body);
  return (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=600');
    res.send(serialized);
  };
}
