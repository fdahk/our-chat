import 'express';

// 鉴权中间件解析 JWT 后挂到 req.user 上的身份信息。
// id/username 来自 token；其余字段来自数据库回查（auth 中间件 SELECT 的列）。
export interface AuthUser {
  id: number;
  username: string;
  email?: string | null;
  nickname?: string | null;
  avatar?: string | null;
  status?: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
