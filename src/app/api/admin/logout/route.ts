import { logout, requireAdmin } from '@/services/auth';
import { assertSameOrigin, errorResponse, jsonResponse, requestToken, sessionCookie } from '@/lib/http';
export const runtime = 'nodejs';
export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const token = requestToken(request);
    await requireAdmin(token);
    await logout(token);
    const response = jsonResponse({ ok: true });
    response.headers.set('Set-Cookie', sessionCookie('', new Date(0)));
    return response;
  } catch (error) { return errorResponse(error); }
}
