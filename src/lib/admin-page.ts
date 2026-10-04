import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/services/auth';
import { SESSION_COOKIE } from './http';
import { ServiceError } from './errors';
export async function requireAdminPage() {
  try { await requireAdmin((await cookies()).get(SESSION_COOKIE)?.value); }
  catch (error) {
    if (error instanceof ServiceError && error.code === 'UNAUTHORIZED') redirect('/admin/login');
    throw error;
  }
}
