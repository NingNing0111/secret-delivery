import { requireAdmin } from '@/services/auth';
import { assertSameOrigin, errorResponse, jsonResponse, requestToken } from './http';
import { readJsonLimited } from './request-body';
import { getEnv } from './env';
import { parseIds } from '@/services/secrets';
import { ServiceError } from './errors';

export type IdContext = { params: Promise<{ id: string }> };
export async function adminResponse(request: Request, action: () => Promise<unknown>): Promise<Response> {
  try {
    await requireAdmin(requestToken(request));
    if (request.method !== 'GET') assertSameOrigin(request);
    const result = await action();
    return result instanceof Response ? result : jsonResponse(result);
  } catch (error) { return errorResponse(error); }
}
export async function readSelection(request: Request): Promise<{ ids: string[]; format?: unknown }> {
  const value = await readJsonLimited(request, getEnv().REQUEST_BODY_LIMIT);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ServiceError('INVALID_INPUT', '选择无效');
  const body = value as Record<string, unknown>;
  return { ids: parseIds(body.ids), format: body.format };
}
