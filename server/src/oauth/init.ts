// OAuth IdP 启动初始化:跑 Prisma 迁移 + seed 默认 client
// schema 由 prisma/schema.prisma + prisma/migrations 管理,本文件不再含 DDL

import { execSync } from 'node:child_process';
import { prisma } from '../database/prisma.js';

// 启动时跑 prisma migrate deploy(只应用 pending,不创建新 migration)。
// 已经 baseline 过的 migration 会被跳过,新 migration 会按顺序应用。
// 失败抛错 → server 启动 fail-fast。
export async function applyPendingMigrations(): Promise<void> {
  try {
    execSync('pnpm prisma migrate deploy', {
      stdio: 'pipe',
      env: process.env,
    });
  } catch (err) {
    const detail = (err as { stderr?: Buffer; stdout?: Buffer }).stderr?.toString()
      ?? (err as { stdout?: Buffer }).stdout?.toString()
      ?? String(err);
    throw new Error(`prisma migrate deploy 失败:\n${detail}`);
  }
}

interface SeedClient {
  client_id: string;
  client_name: string;
  client_type: 'public' | 'confidential';
  redirect_uris: string[];
  allowed_scopes: string[];
  allowed_grant_types: ('authorization_code' | 'refresh_token')[];
}

export const DEFAULT_WEB_CLIENT: SeedClient = {
  client_id: 'our-chat-web',
  client_name: 'our-chat Web SPA',
  client_type: 'public',
  redirect_uris: (
    process.env.OAUTH_WEB_REDIRECT_URI ?? 'http://localhost:5173/oauth/callback'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  allowed_scopes: ['openid', 'profile', 'email', 'agent-server'],
  allowed_grant_types: ['authorization_code', 'refresh_token'],
};

// upsert 保证 dev 重启时 client 配置跟随 env 更新(redirect_uri 改了即生效)
export async function seedDefaultClient(client: SeedClient = DEFAULT_WEB_CLIENT): Promise<void> {
  const dataShared = {
    clientName: client.client_name,
    clientType: client.client_type,
    redirectUris: client.redirect_uris,
    allowedScopes: client.allowed_scopes,
    allowedGrantTypes: client.allowed_grant_types,
  };
  await prisma.oAuthClient.upsert({
    where: { clientId: client.client_id },
    update: dataShared,
    create: { clientId: client.client_id, ...dataShared },
  });
}
