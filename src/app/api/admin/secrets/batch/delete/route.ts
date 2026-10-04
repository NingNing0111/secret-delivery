import { adminResponse, readSelection } from '@/lib/admin-route';
import { deleteSecrets } from '@/services/secrets';
export const runtime = 'nodejs';
export async function POST(request: Request): Promise<Response> {
  return adminResponse(request, async () => ({ count: await deleteSecrets((await readSelection(request)).ids) }));
}
