// GET /.well-known/openid-configuration
// OIDC Discovery 1.0,内容由 issuer 拼接,启动时构造

import type { RequestHandler } from 'express';
import type { IssuerConfig } from './tokens.js';

export function makeDiscoveryHandler(cfg: IssuerConfig): RequestHandler {
  const base = cfg.issuer;
  const body = {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    revocation_endpoint: `${base}/oauth/revoke`,
    introspection_endpoint: `${base}/oauth/introspect`,
    userinfo_endpoint: `${base}/oauth/userinfo`,
    jwks_uri: `${base}/.well-known/jwks.json`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'none'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: ['openid', 'profile', 'email', 'agent-server'],
    claims_supported: [
      'sub',
      'iss',
      'aud',
      'exp',
      'iat',
      'name',
      'email',
      'email_verified',
      'preferred_username',
      'picture',
    ],
  };
  const serialized = JSON.stringify(body);
  return (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(serialized);
  };
}
