// Experimental wire contract. Source-reviewed, NOT live verified in this delivery.
// Endpoint names derive from OpenList's driver and bernd-wechner/Degoo research.
import { z } from 'zod';
import { createHash } from 'node:crypto';
import type { Item, Provider } from './types';
import { invariant, AppError } from './errors';
import { readBounded, validateDownloadUrl } from './safe-download';

export const ADAPTER_VERSION = 'degoo-readonly-v1';
const endpoint = {
  login: 'https://rest-api.degoo.com/login', refresh: 'https://rest-api.degoo.com/access-token/v2',
  graphql: 'https://production-appsync.degoo.com/graphql'
};
const id = z.union([z.string().min(1), z.number().int().safe()]).transform(String);
const wireItem = z.object({
  ID: id, ParentID: id.nullable(), Name: z.string().min(1).max(1024), Category: z.number().int(),
  Size: z.union([z.string().regex(/^\d+$/), z.number().nonnegative()]).transform(Number).refine(Number.isSafeInteger),
  LastModificationTime: z.union([z.string(), z.number()]).optional(),
  IsInRecycleBin: z.boolean(), URL: z.string().nullable().optional()
});
const fields = 'ID ParentID Name Category Size LastModificationTime IsInRecycleBin';
const childrenQuery = `query GetFileChildren5($Token: String!, $ParentID: String, $Limit: Int!, $Order: Int!, $NextToken: String) { getFileChildren5(Token: $Token, ParentID: $ParentID, Limit: $Limit, Order: $Order, NextToken: $NextToken) { Items { ${fields} } NextToken } }`;
const overlayQuery = `query GetOverlay4($Token: String!, $ID: IDType!) { getOverlay4(Token: $Token, ID: $ID) { ${fields} URL } }`;

function normalize(raw: z.infer<typeof wireItem>): Item {
  const n = Number(raw.LastModificationTime);
  const modified = Number.isFinite(n) && n > 0 && n < 8640000000000000 ? new Date(n).toISOString() : null;
  return { id: raw.ID, parentId: raw.ParentID, name: raw.Name,
    kind: [1, 2, 10].includes(raw.Category) ? 'folder' : 'file', size: raw.Size, modified, trashed: raw.IsInRecycleBin };
}
export type DegooConfig = { email: string; password?: string; refreshToken?: string; apiKey: string; rootId: string; hosts: string[] };
export function readDegooConfig(env = process.env): DegooConfig {
  const email = env.DEGOO_EMAIL || '';
  const rootId = env.DEGOO_ROOT_ID || '';
  const hosts = (env.DEGOO_DOWNLOAD_HOSTS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  invariant(email && (env.DEGOO_PASSWORD || env.DEGOO_REFRESH_TOKEN) && env.DEGOO_API_KEY && rootId && rootId !== '0',
    'NOT_CONFIGURED', 'Degoo server configuration is incomplete. See the deployment guide.', 503);
  invariant(hosts.length > 0 && hosts.length <= 10, 'NOT_CONFIGURED', 'Configure exact download hosts before enabling Degoo.', 503);
  hosts.forEach(host => validateDownloadUrl(`https://${host}/`, hosts));
  return { email, password: env.DEGOO_PASSWORD, refreshToken: env.DEGOO_REFRESH_TOKEN, apiKey: env.DEGOO_API_KEY, rootId, hosts };
}
export function scopeHash(config: DegooConfig) {
  return createHash('sha256').update(JSON.stringify([ADAPTER_VERSION, config.email.toLowerCase(), config.rootId, config.apiKey, [...config.hosts].sort()])).digest('hex');
}
export const reportSchema = z.object({
  adapter: z.literal(ADAPTER_VERSION), scope: z.string(), verifiedAt: z.string().datetime(),
  listing: z.literal(true), downloadSha256: z.literal(true), range: z.boolean(), cors: z.boolean()
});
export function checkCompatibility(config: DegooConfig, encoded: string | undefined, now = Date.now()) {
  try {
    const report = reportSchema.parse(JSON.parse(Buffer.from(encoded || '', 'base64url').toString('utf8')));
    const age = now - Date.parse(report.verifiedAt);
    invariant(report.scope === scopeHash(config) && age >= 0 && age < 7 * 86400000,
      'UNVERIFIED', 'Run the Degoo compatibility probe for this account and root before enabling live access.', 503);
    return report;
  } catch {
    throw new AppError('UNVERIFIED', 'Live Degoo access is locked until its compatibility probe passes (valid for 7 days).', 503);
  }
}

export class DegooProvider implements Provider {
  readonly rootId: string;
  private token?: { value: string; until: number };
  private refreshToken?: string;
  private authPending?: Promise<string>;
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequest = 0;
  private queued = 0;
  constructor(readonly config: DegooConfig, private transport: typeof fetch = fetch, private intervalMs = 1000) {
    this.rootId = config.rootId; this.refreshToken = config.refreshToken;
  }
  private async post(url: string, body: unknown, headers: Record<string, string> = {}) {
    let response: Response;
    try {
      response = await this.transport(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body), redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000) });
    } catch { throw new AppError('UPSTREAM_UNAVAILABLE', 'Degoo could not be reached.'); }
    if (!response.ok) {
      await response.body?.cancel();
      throw new AppError(response.status === 429 ? 'RATE_LIMITED' : 'UPSTREAM_REJECTED',
        `Degoo rejected the request (HTTP ${response.status}).`, response.status === 429 ? 503 : 502);
    }
    try { return JSON.parse((await readBounded(response, 2 * 1024 * 1024)).toString('utf8')); }
    catch { throw new AppError('CONTRACT_CHANGED', 'Degoo returned an unexpected response. Re-run compatibility verification.'); }
  }
  private async accessToken(): Promise<string> {
    if (this.token && this.token.until > Date.now()) return this.token.value;
    if (this.authPending) return this.authPending;
    this.authPending = (async () => {
      let value: string | undefined;
      if (!this.refreshToken) {
        invariant(this.config.password, 'AUTH_REQUIRED', 'Degoo authentication needs updating.', 503);
        const data = await this.post(endpoint.login, { Username: this.config.email, Password: this.config.password, GenerateToken: true }, { Origin: 'https://app.degoo.com' });
        this.refreshToken = typeof data.RefreshToken === 'string' ? data.RefreshToken : undefined;
        value = typeof data.Token === 'string' ? data.Token : undefined;
      }
      if (this.refreshToken) {
        const data = await this.post(endpoint.refresh, { RefreshToken: this.refreshToken });
        value = typeof data.AccessToken === 'string' ? data.AccessToken : undefined;
        if (typeof data.RefreshToken === 'string' && data.RefreshToken) this.refreshToken = data.RefreshToken;
      }
      invariant(value, 'AUTH_REQUIRED', 'Degoo did not return an access token.', 503);
      let until = Date.now() + 5 * 60000;
      try {
        const claims = JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString());
        if (typeof claims.exp === 'number') until = Math.min(until, claims.exp * 1000 - 60000);
      } catch { /* Opaque tokens use a conservative five-minute cache. */ }
      this.token = { value, until }; return value;
    })().finally(() => { this.authPending = undefined; });
    return this.authPending;
  }
  private graph(operationName: string, query: string, variables: object) {
    invariant(this.queued < 20, 'BUSY', 'The collection is busy. Please try again shortly.', 503);
    this.queued++;
    const work = this.queue.catch(() => undefined).then(async () => {
      const wait = this.intervalMs - (Date.now() - this.lastRequest);
      if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
      this.lastRequest = Date.now();
      const token = await this.accessToken();
      const json = await this.post(endpoint.graphql, { operationName, query, variables: { ...variables, Token: token } },
        { 'x-api-key': this.config.apiKey, Authorization: `Bearer ${token}` });
      if (json.errors?.length) {
        // Never echo raw GraphQL errors: they may contain tokens or upstream URLs.
        this.token = undefined;
        throw new AppError('GRAPHQL_ERROR', 'Degoo rejected the query. Re-run compatibility verification.');
      }
      invariant(json.data && typeof json.data === 'object', 'CONTRACT_CHANGED', 'Degoo response schema changed.');
      return json.data;
    });
    this.queue = work;
    return work.finally(() => { this.queued--; });
  }
  private async overlay(id: string) {
    const data = await this.graph('GetOverlay4', overlayQuery, { ID: { FileID: id } });
    const result = wireItem.safeParse(data.getOverlay4);
    invariant(result.success, 'CONTRACT_CHANGED', 'Degoo item schema changed.');
    invariant(result.data.ID === id, 'CONTRACT_CHANGED', 'Degoo returned the wrong item.');
    return result.data;
  }
  async get(id: string) { return normalize(await this.overlay(id)); }
  async children(parentId: string) {
    const result: Item[] = [];
    const seen = new Set<string>();
    let next: string | null = null;
    for (let page = 0; page < 100; page++) {
      const data = await this.graph('GetFileChildren5', childrenQuery, { ParentID: parentId, Limit: 100, Order: 3, NextToken: next });
      const parsed = z.object({ Items: z.array(wireItem), NextToken: z.string().nullable().optional() }).safeParse(data.getFileChildren5);
      invariant(parsed.success, 'CONTRACT_CHANGED', 'Degoo folder schema changed.');
      result.push(...parsed.data.Items.map(normalize));
      invariant(result.length <= 5000, 'INDEX_LIMIT', 'Folder exceeds the MVP listing limit.', 503);
      next = parsed.data.NextToken || null;
      if (!next) return result;
      invariant(!seen.has(next), 'PAGINATION_LOOP', 'Degoo repeated a page cursor.');
      seen.add(next);
    }
    throw new AppError('INDEX_LIMIT', 'Folder pagination exceeds the MVP budget.', 503);
  }
  async download(id: string) {
    const raw = await this.overlay(id);
    invariant(normalize(raw).kind === 'file' && !raw.IsInRecycleBin && raw.URL, 'DOWNLOAD_UNAVAILABLE', 'Degoo did not return a file download URL.');
    return validateDownloadUrl(raw.URL, this.config.hosts).href;
  }
}
