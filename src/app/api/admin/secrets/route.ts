import { adminResponse } from '@/lib/admin-route';
import { listSecrets } from '@/services/secrets';
export const runtime = 'nodejs';
export async function GET(request: Request): Promise<Response> {
  return adminResponse(request, () => listSecrets(Object.fromEntries(new URL(request.url).searchParams)));
}
