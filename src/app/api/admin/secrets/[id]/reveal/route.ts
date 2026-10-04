import { adminResponse, type IdContext } from '@/lib/admin-route';
import { revealSecret } from '@/services/secrets';
export const runtime = 'nodejs';
export async function POST(request: Request, context: IdContext): Promise<Response> {
  return adminResponse(request, async () => ({ content: await revealSecret((await context.params).id) }));
}
