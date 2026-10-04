import { adminResponse, readSelection } from '@/lib/admin-route';
import { setSecretStatus } from '@/services/secrets';
export const runtime = 'nodejs';
export async function POST(request: Request): Promise<Response> {
  return adminResponse(request, async () => ({ count: await setSecretStatus((await readSelection(request)).ids, 'DISABLED') }));
}
