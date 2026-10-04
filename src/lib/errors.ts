export type ErrorCode = 'UNAUTHORIZED' | 'FORBIDDEN' | 'INVALID_INPUT' | 'TOO_LARGE' | 'RATE_LIMITED' | 'NOT_FOUND';
export class ServiceError extends Error {
  constructor(public readonly code: ErrorCode, public readonly publicMessage: string) { super(publicMessage); }
}
