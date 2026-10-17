import 'server-only';
import { SingleFlightCache } from './cache';
import { buildSnapshot, requireEntry, assertFreshMembership, isWithin, expandSelection } from './catalog';
import { checkCompatibility, DegooProvider, readDegooConfig } from './degoo';
import { DemoProvider, demoBytes } from './demo';
import { invariant } from './errors';
import { safeFetch, readBounded } from './safe-download';
import { previewKind, type Entry, type Listing, type Provider, type Snapshot } from './types';

export class IndexService {
  cache: SingleFlightCache<Snapshot>;
  readonly cacheSeconds: number;
  constructor(readonly mode: 'demo' | 'degoo', readonly provider: Provider) {
    const seconds = Number(process.env.INDEX_CACHE_SECONDS || 60);
    this.cacheSeconds = Number.isFinite(seconds) ? Math.max(5, Math.min(300, seconds)) : 60;
    this.cache = new SingleFlightCache(this.cacheSeconds * 1000);
  }
  snapshot() { return this.cache.get(() => buildSnapshot(this.provider)); }
  async list(folderId: string | null, query: string, page: number): Promise<Listing> {
    const snapshot = await this.snapshot();
    const folder = requireEntry(snapshot, folderId || snapshot.root.id);
    invariant(folder.kind === 'folder', 'NOT_FOLDER', 'This item is not a folder.', 400);
    const all = [...snapshot.entries.values()];
    const q = query.trim().toLocaleLowerCase();
    // Recursive search is deliberately scoped to the currently open folder.
    const matching = all.filter(item => item.id !== folder.id && (q ? isWithin(item, folder.id, snapshot) && item.name.toLocaleLowerCase().includes(q) : item.parentId === folder.id));
    matching.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'folder' ? -1 : 1) || a.name.localeCompare(b.name));
    const pages = Math.max(1, Math.ceil(matching.length / 100));
    const safePage = Math.min(page, pages);
    const breadcrumbs: Entry[] = [];
    let cursor: Entry | undefined = folder;
    while (cursor) { breadcrumbs.unshift(cursor); cursor = cursor.parentId ? snapshot.entries.get(cursor.parentId) : undefined; }
    return { mode: this.mode, folder, breadcrumbs, items: matching.slice((safePage - 1) * 100, safePage * 100),
      total: matching.length, page: safePage, pages, query,
      stats: { files: all.filter(e => e.kind === 'file').length, folders: all.filter(e => e.kind === 'folder').length - 1,
        bytes: all.reduce((sum, e) => sum + (e.kind === 'file' ? e.size : 0), 0) },
      cachedAt: snapshot.builtAt, cacheSeconds: this.cacheSeconds };
  }
  async file(id: string) {
    const snapshot = await this.snapshot();
    const item = requireEntry(snapshot, id);
    invariant(item.kind === 'file', 'NOT_FILE', 'Choose a file to download.', 400);
    await assertFreshMembership(this.provider, snapshot, id);
    return { item, url: await this.provider.download(id) };
  }
  async text(id: string) {
    const { item, url } = await this.file(id);
    invariant(previewKind(item.name) === 'text', 'NO_PREVIEW', 'Text preview is unavailable for this format.', 415);
    invariant(item.size <= 512 * 1024, 'TOO_LARGE', 'Text preview is limited to 512 KB. Download this file instead.', 413);
    const bytes = this.mode === 'demo' ? (await demoBytes(id)).bytes : await readBounded(await safeFetch(url, (this.provider as DegooProvider).config.hosts), 512 * 1024);
    invariant(bytes.length <= 512 * 1024, 'TOO_LARGE', 'Text preview exceeds 512 KB.', 413);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { invariant(false, 'NO_PREVIEW', 'This file is not UTF-8 text.', 415); }
  }
  async bulk(ids: string[]) {
    const snapshot = await this.snapshot();
    return expandSelection(snapshot, ids).map(item => ({ id: item.id, name: item.name, path: item.path,
      bytes: item.size, href: `/api/download?id=${encodeURIComponent(item.id)}` }));
  }
}
let singleton: IndexService | undefined;
export function service() {
  const mode = process.env.INDEX_MODE;
  invariant(mode === 'demo' || mode === 'degoo', 'NOT_CONFIGURED', 'Choose INDEX_MODE=demo or configure Degoo. See README.md.', 503);
  // Recheck report age on every public request, including warm instances.
  if (mode === 'degoo') checkCompatibility(readDegooConfig(), process.env.DEGOO_COMPATIBILITY);
  if (!singleton) singleton = new IndexService(mode, mode === 'demo' ? new DemoProvider() : new DegooProvider(readDegooConfig()));
  return singleton;
}
