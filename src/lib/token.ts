import { randomBytes } from 'node:crypto';
export function createToken(): string {
  return randomBytes(24).toString('base64url');
}
