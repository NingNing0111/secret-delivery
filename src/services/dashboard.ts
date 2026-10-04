import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { stateWhere } from './secrets';

export async function getDashboard(): Promise<{ total: number; active: number; expired: number; disabled: number; views: number }> {
  const now = new Date();
  const [total, active, expired, disabled, aggregate] = await db.$transaction([
    db.secret.count(),
    db.secret.count({ where: stateWhere('ACTIVE', now) }),
    db.secret.count({ where: stateWhere('EXPIRED', now) }),
    db.secret.count({ where: stateWhere('DISABLED', now) }),
    db.secret.aggregate({ _sum: { viewCount: true } }),
  ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  return { total, active, expired, disabled, views: aggregate._sum.viewCount ?? 0 };
}
