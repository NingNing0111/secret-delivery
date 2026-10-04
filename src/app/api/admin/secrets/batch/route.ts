import { requireAdmin } from '@/services/auth';
import { createBatch } from '@/services/batches';
import { assertSameOrigin, errorResponse, jsonResponse, requestToken } from '@/lib/http';
import { getEnv } from '@/lib/env';
import { readJsonLimited } from '@/lib/request-body';
import { parseBatchInput } from '@/lib/batch-input';

export const runtime = 'nodejs';
export async function POST(request: Request): Promise<Response> {
  try {
    await requireAdmin(requestToken(request));
    assertSameOrigin(request);
    const input = parseBatchInput(await readJsonLimited(request, getEnv().REQUEST_BODY_LIMIT));
    return jsonResponse(await createBatch(input), 201);
  } catch (error) { return errorResponse(error); }
}
