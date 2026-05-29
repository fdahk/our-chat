import crypto from 'crypto';

const isProduction = process.env.NODE_ENV === 'production';

export const TOKEN_COOKIE = 'token';
export const CSRF_COOKIE = 'csrfToken';

// 记住我 7 天，否则 1 小时（与 JWT expiresIn 保持一致）
export const REMEMBER_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
export const SESSION_MAX_AGE = 60 * 60 * 1000;

// sameSite=strict + 同源部署：跨站请求不会携带这两个 cookie，从源头削弱 CSRF。
// 生产走 https 时 secure=true；开发是 http，secure 必须为 false 否则 cookie 不会被写入。
const baseCookie = (maxAge) => ({
  secure: isProduction,
  sameSite: 'strict',
  path: '/',
  maxAge,
});

export const generateCsrfToken = () => crypto.randomBytes(24).toString('hex');

// token 走 HttpOnly（JS 读不到，XSS 偷不走、也外带不出去）；
// csrfToken 故意可读，供前端读出后回填到 X-CSRF-Token 头，做双提交校验。
export const setAuthCookies = (res, token, csrfToken, maxAge) => {
  res.cookie(TOKEN_COOKIE, token, { ...baseCookie(maxAge), httpOnly: true });
  res.cookie(CSRF_COOKIE, csrfToken, { ...baseCookie(maxAge), httpOnly: false });
};

export const clearAuthCookies = (res) => {
  res.clearCookie(TOKEN_COOKIE, { path: '/' });
  res.clearCookie(CSRF_COOKIE, { path: '/' });
};
