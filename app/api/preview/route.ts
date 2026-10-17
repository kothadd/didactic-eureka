import { service } from '../../../lib/service';
import { apiError, json, parameterId } from '../../../lib/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try { return json({ text: await service().text(parameterId(request)) }); }
  catch (error) { return apiError(error); }
}
