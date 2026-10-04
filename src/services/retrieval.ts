import { db } from '@/lib/db';
import { decryptSecret } from '@/lib/crypto';
import type { EncryptedSecret, RetrievalResult } from './types';

export async function retrieveSecret(token: string): Promise<RetrievalResult> {
  return db.$transaction(async tx => {
    const rows = await tx.$queryRaw<(EncryptedSecret & { expiresAt: Date | null })[]>`
      UPDATE "Secret"
      SET "viewCount" = "viewCount" + 1,
          "lastViewedAt" = CURRENT_TIMESTAMP,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "token" = ${token}
        AND "status" = 'ACTIVE'
        AND ("expiresAt" IS NULL OR "expiresAt" > CURRENT_TIMESTAMP)
        AND ("maxViews" IS NULL OR "viewCount" < "maxViews")
      RETURNING "ciphertext", "iv", "authTag", "expiresAt"
    `;
    if (rows.length) {
      return { ok: true, content: decryptSecret(rows[0]), expiresAt: rows[0].expiresAt };
    }
    const row = await tx.secret.findUnique({
      where: { token },
      select: { status: true, expiresAt: true, viewCount: true, maxViews: true },
    });
    if (!row) return { ok: false, reason: 'not_found' };
    if (row.status === 'DISABLED') return { ok: false, reason: 'disabled' };
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return { ok: false, reason: 'expired' };
    return { ok: false, reason: 'exhausted' };
  });
}
