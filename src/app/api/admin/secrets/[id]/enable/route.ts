import { adminResponse, type IdContext } from '@/lib/admin-route';
import { setSecretStatus } from '@/services/secrets';
export const runtime = 'nodejs';
export async function POST(request: Request, context: IdContext): Promise<Response> {
  return adminResponse(request, async () => ({ count: await setSecretStatus([(await context.params).id], 'ACTIVE') }));
}
