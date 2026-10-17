import { service } from '../../../lib/service';
import { apiError, noStore, parameterId } from '../../../lib/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const { url } = await service().file(parameterId(request));
    return new Response(null, { status: 302, headers: { ...noStore, Location: url } });
  } catch (error) { return apiError(error); }
}
