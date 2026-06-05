// RSA 私钥加载 + 公钥派生 + JWKS 生成
// 启动 fail-fast:任一密钥加载失败 server 拒绝启动

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { exportJWK, importPKCS8, importSPKI, type CryptoKey, type JWK } from 'jose';

export interface SigningKey {
  kid: string;
  alg: 'RS256';
  privateKey: CryptoKey;      // 签发
  publicKey: CryptoKey;       // 验签(由私钥派生)
  publicJwk: JWK;             // JWKS 公开
}

export interface KeyStore {
  active: SigningKey;
  all: ReadonlyMap<string, SigningKey>;
}

interface LoadOptions {
  activeKid: string;
  retiredKids: string[];
  keyDir?: string;
  privateKeyFile?: string;
}

async function loadOne(kid: string, file: string): Promise<SigningKey> {
  const pem = readFileSync(file, 'utf8');
  if (!pem.includes('PRIVATE KEY')) {
    throw new Error(`oauth-keys: ${file} 不是 PKCS#8 PEM 私钥`);
  }
  const privateKey = await importPKCS8(pem, 'RS256');

  // 从私钥派生公钥(PEM SPKI)
  const nodePriv = createPrivateKey(pem);
  const nodePub = createPublicKey(nodePriv);
  const spkiPem = nodePub.export({ format: 'pem', type: 'spki' }).toString();
  const publicKey = await importSPKI(spkiPem, 'RS256');

  const jwk = await exportJWK(publicKey);
  if (jwk.kty !== 'RSA' || !jwk.n) {
    throw new Error(`oauth-keys: ${kid} 不是 RSA 公钥`);
  }
  const modulusBits = Buffer.from(jwk.n, 'base64url').length * 8;
  if (modulusBits < 2048) {
    throw new Error(`oauth-keys: ${kid} 模数 ${modulusBits} 位,不满足 ≥ 2048`);
  }

  const publicJwk: JWK = {
    kty: jwk.kty,
    n: jwk.n,
    e: jwk.e,
    alg: 'RS256',
    use: 'sig',
    kid,
  };

  return { kid, alg: 'RS256', privateKey, publicKey, publicJwk };
}

function resolveFile(opts: LoadOptions, kid: string): string {
  if (opts.privateKeyFile && kid === opts.activeKid) {
    return resolve(opts.privateKeyFile);
  }
  if (!opts.keyDir) {
    throw new Error(`oauth-keys: 未配置 OAUTH_KEY_DIR,无法加载 kid=${kid}`);
  }
  return resolve(opts.keyDir, `oauth-private-${kid}.pem`);
}

export async function loadKeyStore(opts: LoadOptions): Promise<KeyStore> {
  const all = new Map<string, SigningKey>();
  const active = await loadOne(opts.activeKid, resolveFile(opts, opts.activeKid));
  all.set(active.kid, active);
  for (const kid of opts.retiredKids) {
    const k = await loadOne(kid, resolveFile(opts, kid));
    all.set(k.kid, k);
  }
  return { active, all };
}

export function buildJwksResponse(store: KeyStore): { keys: JWK[] } {
  return { keys: Array.from(store.all.values()).map((k) => k.publicJwk) };
}

export function readKeyOptionsFromEnv(): LoadOptions {
  const activeKid = process.env.OAUTH_ACTIVE_KID;
  if (!activeKid) {
    throw new Error('oauth-keys: 缺少 OAUTH_ACTIVE_KID');
  }
  const retiredKids = (process.env.OAUTH_RETIRED_KIDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    activeKid,
    retiredKids,
    keyDir: process.env.OAUTH_KEY_DIR,
    privateKeyFile: process.env.OAUTH_PRIVATE_KEY_FILE,
  };
}
