import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { encryptSecret } from '@/lib/crypto';
import { createToken } from '@/lib/token';
import { getEnv } from '@/lib/env';
import { secretPreview } from '@/lib/preview';
import type { BatchResult, CreateBatchInput } from './types';

export async function createBatch(input: CreateBatchInput): Promise<BatchResult> {
  const baseUrl = getEnv().PUBLIC_BASE_URL;
  for (let attempt = 0; attempt < 3; attempt++) {
    const batchId = randomUUID();
    const createdAt = new Date();
    const rows = input.secrets.map((content, batchIndex) => ({
      ...encryptSecret(content), token: createToken(), batchId, batchIndex,
      createdAt, expiresAt: input.expiresAt, maxViews: input.maxViews,
    }));
    try {
      await db.$transaction(async tx => {
        for (let offset = 0; offset < rows.length; offset += 500) {
          await tx.secret.createMany({ data: rows.slice(offset, offset + 500) });
        }
      }, { timeout: 30000 });
      return {
        total: rows.length, success: rows.length, failed: 0,
        items: rows.map((row, index) => ({ index, url: `${baseUrl}/k/${row.token}`, preview: secretPreview(input.secrets[index]) })),
      };
    } catch (error) {
      const target = error instanceof Prisma.PrismaClientKnownRequestError ? error.meta?.target : undefined;
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && Array.isArray(target) && target.includes('token')) || attempt === 2) throw error;
    }
  }
  throw new Error('Batch retry exhausted');
}
