import { demoBytes } from '../../../lib/demo';
import { apiError, parameterId, noStore } from '../../../lib/http';
import { invariant } from '../../../lib/errors';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    invariant(process.env.INDEX_MODE === 'demo', 'NOT_FOUND', 'Not found.', 404);
    const { bytes, type, name } = await demoBytes(parameterId(request));
    const headers = { ...noStore, 'Content-Type': type, 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(name)}`, 'Accept-Ranges': 'bytes' };
    const range = request.headers.get('range');
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      const start = Number(match?.[1]), end = Math.min(Number(match?.[2] || bytes.length - 1), bytes.length - 1);
      if (!match || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= bytes.length)
        return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${bytes.length}` } });
      return new Response(new Uint8Array(bytes.subarray(start, end + 1)), { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': String(end - start + 1) } });
    }
    return new Response(new Uint8Array(bytes), { headers: { ...headers, 'Content-Length': String(bytes.length) } });
  } catch (error) { return apiError(error); }
}
