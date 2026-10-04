import { ServiceError } from './errors';

// Single-instance global budget: constant memory, no attacker-controlled IP keys.
export class LoginLimiter {
  private count = 0;
  private resetAt = 0;
  constructor(private readonly limit = 20, private readonly windowMs = 60_000) {}
  consume(now = Date.now()): void {
    if (now >= this.resetAt) { this.count = 0; this.resetAt = now + this.windowMs; }
    if (this.count >= this.limit) throw new ServiceError('RATE_LIMITED', '登录尝试过于频繁，请稍后再试');
    this.count++;
  }
}
export const loginLimiter = new LoginLimiter();
