import { z } from 'zod';
import { login } from '@/services/auth';
import { assertSameOrigin, errorResponse, jsonResponse, sessionCookie } from '@/lib/http';
import { loginLimiter } from '@/lib/login-limiter';
import { readJsonLimited } from '@/lib/request-body';
import { ServiceError } from '@/lib/errors';
export const runtime = 'nodejs';
export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    loginLimiter.consume();
    const parsed = z.object({ password: z.string().min(1).max(1024) }).safeParse(await readJsonLimited(request, 8192));
    if (!parsed.success) throw new ServiceError('INVALID_INPUT', '请输入有效密码');
    const session = await login(parsed.data.password);
    const response = jsonResponse({ ok: true });
    response.headers.set('Set-Cookie', sessionCookie(session.token, session.expiresAt));
    return response;
  } catch (error) { return errorResponse(error); }
}
