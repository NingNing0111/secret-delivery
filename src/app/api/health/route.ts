import { db } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { jsonResponse } from '@/lib/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    getEnv();
    await db.$queryRaw`SELECT 1`;
    return jsonResponse({ ok: true });
  } catch {
    return jsonResponse({ ok: false }, 503);
  }
}
