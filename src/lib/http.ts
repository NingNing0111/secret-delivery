import { ServiceError, type ErrorCode } from './errors';

export const SESSION_COOKIE = 'sd_session';
export function assertSameOrigin(request: Request): void {
  const expected = URL.parse(process.env.PUBLIC_BASE_URL ?? '')?.origin;
  if (!expected || request.headers.get('origin') !== expected) throw new ServiceError('FORBIDDEN', '请求来源不受信任');
}
function secureCookieDefault(): boolean {
  const url = URL.parse(process.env.PUBLIC_BASE_URL ?? '');
  const localOverride = process.env.ALLOW_INSECURE_LOCAL_COOKIE === 'true'
    && url?.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  return process.env.NODE_ENV === 'production' && !localOverride;
}
export function sessionCookie(token: string, expiresAt: Date, secure = secureCookieDefault()): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}${secure ? '; Secure' : ''}`;
}
export function requestToken(request: Request): string | undefined {
  const cookie = request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(`${SESSION_COOKIE}=`));
  return cookie?.slice(SESSION_COOKIE.length + 1);
}
export function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: {
    'Cache-Control': 'no-store, max-age=0',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow',
    'X-Content-Type-Options': 'nosniff',
  } });
}
export function errorResponse(error: unknown): Response {
  const statuses: Record<ErrorCode, number> = { UNAUTHORIZED: 401, FORBIDDEN: 403, INVALID_INPUT: 400, TOO_LARGE: 413, RATE_LIMITED: 429, NOT_FOUND: 404 };
  return error instanceof ServiceError
    ? jsonResponse({ error: error.publicMessage }, statuses[error.code])
    : jsonResponse({ error: '服务暂时不可用，请稍后再试' }, 500);
}
