import { service } from '../../../lib/service';
import { json, apiError } from '../../../lib/http';
import { invariant } from '../../../lib/errors';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const query = params.get('q') || '', folder = params.get('folder');
    const page = Number(params.get('page') || '1');
    invariant(query.length <= 200 && (!folder || folder.length <= 256) && Number.isInteger(page) && page >= 1 && page <= 10000,
      'BAD_QUERY', 'Invalid search or pagination parameters.', 400);
    return json(await service().list(folder, query, page));
  } catch (error) { return apiError(error); }
}
