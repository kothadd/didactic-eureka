import { test } from 'node:test';
import assert from 'node:assert/strict';
// Run under node --conditions=react-server so server-only modules are importable.
import { GET as list } from '../app/api/list/route';
import { GET as download } from '../app/api/download/route';
import { GET as preview } from '../app/api/preview/route';
import { GET as demo } from '../app/api/demo-file/route';
import { POST as bulk } from '../app/api/bulk/route';
process.env.INDEX_MODE = 'demo';
const request = (path: string) => new Request(`http://localhost:3000${path}`);
test('public route integration: browse, recursive search, download, preview, range and bulk', async () => {
  const initial = await list(request('/api/list'));
  assert.equal(initial.status, 200);
  assert.equal(initial.headers.get('cache-control'), 'private, no-store');
  const home = await initial.json();
  assert.equal(home.mode, 'demo'); assert.equal(home.folder.name, 'Public'); assert.equal(home.folder.parentId, null);
  assert.equal(home.stats.files, 7);
  const search = await (await list(request('/api/list?q=getting'))).json();
  assert.equal(search.items[0].id, 'guide'); assert.deepEqual(search.items[0].path, ['Documents', 'Guides', 'Getting-started.md']);
  const narrowed = await (await list(request('/api/list?folder=images&q=getting'))).json();
  assert.equal(narrowed.total, 0);
  const nested = await (await list(request('/api/list?folder=guides'))).json();
  assert.deepEqual(nested.breadcrumbs.map((x: { name: string }) => x.name), ['Public', 'Documents', 'Guides']);
  const redirected = await download(request('/api/download?id=welcome'));
  assert.equal(redirected.status, 302); assert.equal(redirected.headers.get('location'), '/api/demo-file?id=welcome');
  const text = await (await preview(request('/api/preview?id=welcome'))).json();
  assert.match(text.text, /Welcome to the Public collection/);
  const partial = await demo(new Request('http://localhost:3000/api/demo-file?id=audio', { headers: { Range: 'bytes=0-3' } }));
  assert.equal(partial.status, 206); assert.equal(await partial.text(), 'RIFF');
  const manifest = await bulk(new Request('http://localhost:3000/api/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' }, body: JSON.stringify({ ids: ['documents', 'guide'] }) }));
  assert.equal(manifest.status, 200);
  const files = (await manifest.json()).files;
  assert.equal(files.length, 3); assert.equal(files.filter((f: { id: string }) => f.id === 'guide').length, 1);
  assert.ok(files.every((f: { href: string }) => f.href.startsWith('/api/download?id=')));
});
test('public routes reject arbitrary IDs, traversal, invalid input and cross-origin bulk', async () => {
  for (const id of ['hidden', '../etc/passwd', 'private']) {
    assert.equal((await download(request(`/api/download?id=${encodeURIComponent(id)}`))).status, 404);
    assert.equal((await preview(request(`/api/preview?id=${encodeURIComponent(id)}`))).status, 404);
    assert.equal((await list(request(`/api/list?folder=${encodeURIComponent(id)}`))).status, 404);
  }
  assert.equal((await download(request('/api/download?id=documents'))).status, 400);
  assert.equal((await preview(request('/api/preview?id=image'))).status, 415);
  assert.equal((await list(request('/api/list?page=NaN'))).status, 400);
  assert.equal((await demo(new Request('http://localhost:3000/api/demo-file?id=welcome', { headers: { Range: 'bytes=99999-' } }))).status, 416);
  for (const [body, origin, expected] of [['{bad', 'http://localhost:3000', 400], ['{"ids":["private"]}', 'http://localhost:3000', 404], ['{"ids":["welcome"]}', 'https://evil.example', 403], [JSON.stringify({ ids: ['x'.repeat(33000)] }), 'http://localhost:3000', 413]] as const) {
    const response = await bulk(new Request('http://localhost:3000/api/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body }));
    assert.equal(response.status, expected);
  }
});
test('live mode cannot silently use demo data or unverified credentials', async () => {
  process.env.INDEX_MODE = 'degoo';
  try {
    const response = await list(request('/api/list'));
    assert.equal(response.status, 503);
    assert.notEqual((await response.json()).mode, 'demo');
    assert.equal((await demo(request('/api/demo-file?id=welcome'))).status, 404);
  } finally { process.env.INDEX_MODE = 'demo'; }
});
