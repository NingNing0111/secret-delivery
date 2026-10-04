export type EncryptedSecret = { ciphertext: string; iv: string; authTag: string };
export type CreateBatchInput = { secrets: string[]; expiresAt: Date | null; maxViews: number | null };
export type BatchResult = { total: number; success: number; failed: number; items: { index: number; url: string; preview: string }[] };
export type RetrievalResult = { ok: true; content: string; expiresAt: Date | null } | { ok: false; reason: 'not_found' | 'disabled' | 'expired' | 'exhausted' };
