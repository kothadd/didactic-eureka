import { AppError } from './errors';
export const noStore = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
export function json(data: unknown, status = 200) { return Response.json(data, { status, headers: noStore }); }
export function apiError(error: unknown) {
  if (error instanceof AppError) return json({ error: { code: error.code, message: error.message } }, error.status);
  // Never log provider objects, credentials, signed links, or raw fetch errors.
  console.error('index_request_failed');
  return json({ error: { code: 'INTERNAL', message: 'The index is temporarily unavailable. Please try again.' } }, 500);
}
export function parameterId(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id || id.length > 256 || /[\x00-\x1f]/.test(id)) throw new AppError('BAD_ID', 'A valid item ID is required.', 400);
  return id;
}
