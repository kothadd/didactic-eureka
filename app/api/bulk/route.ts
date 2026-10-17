import { service } from '../../../lib/service';
import { apiError, json } from '../../../lib/http';
import { invariant } from '../../../lib/errors';
import { z } from 'zod';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    invariant(!origin || origin === new URL(request.url).origin, 'BAD_ORIGIN', 'Cross-origin bulk requests are not supported.', 403);
    invariant(request.headers.get('content-type')?.startsWith('application/json'), 'BAD_BODY', 'Send a JSON selection.', 415);
    // Bound streamed bodies as well as Content-Length; never trust that header alone.
    const reader = request.body?.getReader();
    invariant(reader, 'BAD_BODY', 'Selection is required.', 400);
    const chunks: Uint8Array[] = []; let bytes = 0;
    try {
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        bytes += chunk.value.length;
        invariant(bytes <= 32768, 'BAD_BODY', 'Selection is too large.', 413);
        chunks.push(chunk.value);
      }
    } finally { await reader.cancel(); }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return json({ error: { code: 'BAD_BODY', message: 'Invalid JSON.' } }, 400); }
    const parsed = z.object({ ids: z.array(z.string().min(1).max(256)).min(1).max(100) }).strict().safeParse(body);
    invariant(parsed.success, 'BAD_BODY', 'Select between 1 and 100 entries.', 400);
    return json({ files: await service().bulk(parsed.data.ids) });
  } catch (error) { return apiError(error); }
}
