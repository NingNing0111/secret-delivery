import { retrieveSecret } from '@/services/retrieval';
import { errorResponse, jsonResponse } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const result = await retrieveSecret((await params).token);
    return jsonResponse(result, result.ok ? 200 : result.reason === 'not_found' ? 404 : 410);
  } catch (error) { return errorResponse(error); }
}
