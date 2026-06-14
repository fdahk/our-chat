// 集成测试需要 DATABASE_URL,在加载 prisma 之前先注入 .env(必须是首个 import)。
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { prisma } from '../../src/database/prisma.js';
import { config } from '../../src/config/config.js';
import { TOKEN_COOKIE, CSRF_COOKIE } from '../../src/utils/authCookies.js';

// 集成测试公共工具:连真 PG(docker),造数据、发鉴权 cookie、收尾清理。

export async function createUser(): Promise<{ id: bigint; username: string }> {
  const username = `it_${randomUUID().slice(0, 12)}`;
  const user = await prisma.user.create({
    data: { username, password: 'x' },
    select: { id: true, username: true },
  });
  return user;
}

// 构造可通过 authenticateToken 的 cookie:token(HttpOnly JWT)+ csrfToken(双提交)。
// 与 setAuthCookies 同结构,签名密钥取运行时 config.jwtSecret,无需 .env 对齐。
export function authCookies(user: { id: bigint; username: string }): {
  cookie: string;
  csrf: string;
} {
  const token = jwt.sign({ id: Number(user.id), username: user.username }, config.jwtSecret, {
    expiresIn: '1h',
  });
  const csrf = 'csrf_' + randomUUID().slice(0, 8);
  return { cookie: `${TOKEN_COOKIE}=${token}; ${CSRF_COOKIE}=${csrf}`, csrf };
}

// 删会话即级联清掉其 UserConversation / messages;再删用户。顺序无所谓(均 cascade)。
export async function cleanup(conversationIds: string[], userIds: bigint[]): Promise<void> {
  if (conversationIds.length) {
    await prisma.conversation.deleteMany({ where: { id: { in: conversationIds } } });
  }
  if (userIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

export { prisma };
