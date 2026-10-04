import { adminResponse, readSelection } from '@/lib/admin-route';
import { getExportUrls } from '@/services/secrets';
import { exportLinks } from '@/lib/exports';
import { ServiceError } from '@/lib/errors';
import { jsonResponse } from '@/lib/http';
export const runtime = 'nodejs';
export async function POST(request: Request): Promise<Response> {
  return adminResponse(request, async () => {
    const { ids, format = 'txt' } = await readSelection(request);
    if (format !== 'txt' && format !== 'csv') throw new ServiceError('INVALID_INPUT', '导出格式无效');
    const headers = new Headers(jsonResponse(null).headers);
    headers.set('Content-Type', format === 'csv' ? 'text/csv; charset=utf-8' : 'text/plain; charset=utf-8');
    headers.set('Content-Disposition', `attachment; filename="secret-links-${new Date().toISOString().replace(/[:.]/g, '-')}.${format}"`);
    return new Response(exportLinks(await getExportUrls(ids), format), { headers });
  });
}
