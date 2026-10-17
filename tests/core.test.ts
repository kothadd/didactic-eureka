import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot, requireEntry, assertFreshMembership, expandSelection } from '../lib/catalog';
import { SingleFlightCache } from '../lib/cache';
import { validateDownloadUrl, readBounded } from '../lib/safe-download';
import { checkCompatibility, scopeHash, ADAPTER_VERSION, type DegooConfig } from '../lib/degoo';
import type { Item, Provider } from '../lib/types';
import { previewKind } from '../lib/types';
const item = (id: string, parentId: string | null, name: string, kind: 'folder' | 'file' = 'file'): Item => ({ id, parentId, name, kind, size: kind === 'file' ? 10 : 0, modified: null, trashed: false });
function fixture() {
  const rows = [item('public', 'account', 'Public', 'folder'), item('nested', 'public', 'Nested', 'folder'), item('one', 'nested', 'one.txt'), item('two', 'public', 'two.txt'), item('private', 'account', 'secret.txt'), { ...item('deleted', 'public', 'deleted.txt'), trashed: true }];
  const provider: Provider = { rootId: 'public', async get(id) { const found = rows.find(i => i.id === id); if (!found) throw Error('missing'); return { ...found }; }, async children(id) { return rows.filter(i => i.parentId === id).map(i => ({ ...i })); }, async download() { return 'https://files.example.com/file'; } };
  return { rows, provider };
}
test('only Public descendants enter the catalog; account parent is removed', async () => {
  const { provider } = fixture(), s = await buildSnapshot(provider);
  assert.deepEqual([...s.entries.keys()], ['public', 'nested', 'two', 'one']);
  assert.equal(s.root.parentId, null);
  assert.deepEqual(s.entries.get('one')?.path, ['Nested', 'one.txt']);
  assert.throws(() => requireEntry(s, 'private'), /not found/);
});
test('wrong or renamed root fails closed', async () => {
  const { provider, rows } = fixture(); rows[0].name = 'Private';
  await assert.rejects(buildSnapshot(provider), /named Public/);
});
test('unexpected parent IDs never enter the index', async () => {
  const { provider, rows } = fixture(); provider.children = async () => [rows[4]];
  await assert.rejects(buildSnapshot(provider), /inconsistent/);
});
test('cycles and duplicate IDs are rejected', async () => {
  const { provider, rows } = fixture(); provider.children = async id => [{ ...rows[0], parentId: id }];
  await assert.rejects(buildSnapshot(provider), /duplicate or cyclic/);
});
test('crawl limits never publish a partial index', async () => {
  await assert.rejects(buildSnapshot(fixture().provider, { maxItems: 2 }), /size or depth/);
  await assert.rejects(buildSnapshot(fixture().provider, { maxFolders: 1 }), /crawl budget/);
});
test('fresh membership denies a file moved outside Public after caching', async () => {
  const { provider, rows } = fixture(), s = await buildSnapshot(provider);
  rows[2].parentId = 'account';
  await assert.rejects(assertFreshMembership(provider, s, 'one'), /moved/);
});
test('fresh membership denies an ancestor moved outside Public', async () => {
  const { provider, rows } = fixture(), s = await buildSnapshot(provider);
  rows[1].parentId = 'account';
  await assert.rejects(assertFreshMembership(provider, s, 'one'), /moved/);
});
test('deleted files cannot download from a previously built snapshot', async () => {
  const { provider, rows } = fixture(), s = await buildSnapshot(provider);
  rows[2].trashed = true;
  await assert.rejects(assertFreshMembership(provider, s, 'one'), /not found/);
});
test('bulk selection expands folders and deduplicates overlapping selection', async () => {
  const s = await buildSnapshot(fixture().provider);
  assert.deepEqual(expandSelection(s, ['nested', 'one']).map(x => x.id), ['one']);
  assert.equal(expandSelection(s, ['public']).length, 2);
  assert.throws(() => expandSelection(s, ['private']), /not found/);
  assert.throws(() => expandSelection(s, ['public'], 1), /at most/);
});
test('cache coalesces concurrent reads and never serves expired data on error', async () => {
  let now = 0, calls = 0;
  const cache = new SingleFlightCache<number>(10, () => now);
  const load = async () => { calls++; return calls; };
  assert.deepEqual(await Promise.all([cache.get(load), cache.get(load)]), [1, 1]);
  now = 9; assert.equal(await cache.get(load), 1);
  now = 11; await assert.rejects(cache.get(async () => { throw Error('offline'); }), /offline/);
  assert.equal(await cache.get(load), 2);
});
test('downloads enforce exact HTTPS hosts and reject credentials, ports, IPs and suffix tricks', () => {
  const hosts = ['files.example.com'];
  assert.equal(validateDownloadUrl('https://files.example.com/a?sig=abc', hosts).hostname, hosts[0]);
  for (const url of ['http://files.example.com/a', 'https://files.example.com.evil.test/a', 'https://user:pass@files.example.com/a', 'https://files.example.com:444/a', 'https://127.0.0.1/a', 'file:///etc/passwd', 'javascript:alert(1)', 'https://files.example.com/a#fragment'])
    assert.throws(() => validateDownloadUrl(url, hosts));
});
test('stream bounds are enforced without trusting content-length', async () => {
  await assert.rejects(readBounded(new Response('123456'), 5), /exceeds/);
  assert.equal((await readBounded(new Response('123'), 5)).toString(), '123');
});
test('active content formats never become inline HTML previews', () => {
  for (const file of ['x.html', 'x.svg', 'x.xhtml', 'x.pdf']) assert.equal(previewKind(file), 'none');
  assert.equal(previewKind('x.md'), 'text');
});
const config: DegooConfig = { email: 'test@example.invalid', password: 'test-only', apiKey: 'test-key', rootId: 'public', hosts: ['files.example.com'] };
test('live gate rejects missing, expired, and different-root evidence', () => {
  const now = Date.now();
  const encode = (time: number) => Buffer.from(JSON.stringify({ adapter: ADAPTER_VERSION, scope: scopeHash(config), verifiedAt: new Date(time).toISOString(), listing: true, downloadSha256: true, range: false, cors: false })).toString('base64url');
  assert.throws(() => checkCompatibility(config, undefined), /locked/);
  assert.equal(checkCompatibility(config, encode(now), now).listing, true);
  assert.throws(() => checkCompatibility({ ...config, rootId: 'another' }, encode(now), now), /locked/);
  assert.throws(() => checkCompatibility(config, encode(now - 8 * 86400000), now), /locked/);
  assert.throws(() => checkCompatibility(config, encode(now + 1000), now), /locked/);
});
