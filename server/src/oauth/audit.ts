// OAuth 审计日志:结构化输出,reuse_detected 必须 WARN

import type { Request } from 'express';

export type AuditLevel = 'INFO' | 'WARN' | 'ERROR';

export type AuditEvent =
  | 'client_created'
  | 'code_issued'
  | 'code_exchanged'
  | 'token_refreshed'
  | 'rt_reuse_detected'
  | 'token_revoked'
  | 'client_disabled'
  | 'key_rotation'
  | 'param_invalid'
  | 'grant_rejected'
  | 'client_rejected'
  | 'internal_error';

interface AuditFields {
  event: AuditEvent;
  level?: AuditLevel;
  client_id?: string;
  user_id?: number;
  family_id?: string;
  old_rt_jti?: string;
  new_rt_jti?: string;
  jti?: string;
  reason?: string;
  request_id?: string;
  ip?: string;
  user_agent?: string;
  [extra: string]: unknown;
}

const DEFAULT_LEVEL: Record<AuditEvent, AuditLevel> = {
  client_created: 'INFO',
  code_issued: 'INFO',
  code_exchanged: 'INFO',
  token_refreshed: 'INFO',
  rt_reuse_detected: 'WARN',
  token_revoked: 'INFO',
  client_disabled: 'INFO',
  key_rotation: 'INFO',
  param_invalid: 'INFO',
  grant_rejected: 'INFO',
  client_rejected: 'INFO',
  internal_error: 'ERROR',
};

export function audit(fields: AuditFields): void {
  const level = fields.level ?? DEFAULT_LEVEL[fields.event];
  const record = {
    ts: new Date().toISOString(),
    level,
    module: 'oauth',
    ...fields,
  };
  // 简单的 stdout 结构化日志;接入 ELK / Loki 时 sink 改这里
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(record));
}

export function reqContext(req: Request): { ip: string; user_agent: string } {
  // X-Forwarded-For 来自反向代理,取第一段;直连场景用 req.ip
  const xff = req.headers['x-forwarded-for'];
  const xffStr = Array.isArray(xff) ? xff[0] : xff;
  const ip = xffStr?.split(',')[0]?.trim() ?? req.ip ?? 'unknown';
  const ua = req.headers['user-agent'] ?? 'unknown';
  return { ip, user_agent: ua };
}
