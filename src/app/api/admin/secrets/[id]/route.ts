import { adminResponse, type IdContext } from '@/lib/admin-route';
import { getSecret, deleteSecrets } from '@/services/secrets';
export const runtime = 'nodejs';
export async function GET(request: Request, context: IdContext): Promise<Response> {
  return adminResponse(request, async () => getSecret((await context.params).id));
}
export async function DELETE(request: Request, context: IdContext): Promise<Response> {
  return adminResponse(request, async () => ({ count: await deleteSecrets([(await context.params).id]) }));
}
