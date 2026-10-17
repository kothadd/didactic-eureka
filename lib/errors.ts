export class AppError extends Error {
  constructor(public code: string, message: string, public status = 502) { super(message); }
}
export function invariant(condition: unknown, code: string, message: string, status = 502): asserts condition {
  if (!condition) throw new AppError(code, message, status);
}
