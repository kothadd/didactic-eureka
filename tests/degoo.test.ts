import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DegooProvider, type DegooConfig } from '../lib/degoo';
const config: DegooConfig = { email: 'test@example.invalid', password: 'test-only', apiKey: 'test-key', rootId: 'root', hosts: ['files.example.com'] };
const wire = (id: string) => ({ ID: id, ParentID: 'root', Name: `${id}.txt`, Category: 3, Size: '12', LastModificationTime: '1720000000000', IsInRecycleBin: false });
function mock(graph: (body: any) => unknown) {
  const calls: { url: string; body: any }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input), body = JSON.parse(String(init?.body)); calls.push({ url, body });
    assert.equal(init?.redirect, 'error');
    if (url.endsWith('/login')) return Response.json({ RefreshToken: 'fake-refresh' });
    if (url.endsWith('/access-token/v2')) return Response.json({ AccessToken: 'fake-access' });
    return Response.json(graph(body));
  };
  return { provider: new DegooProvider(config, fetcher, 0), calls };
}
test('adapter follows every pagination cursor and keeps auth server-side', async () => {
  const { provider, calls } = mock(body => ({ data: { getFileChildren5: body.variables.NextToken ? { Items: [wire('b')], NextToken: null } : { Items: [wire('a')], NextToken: 'next' } } }));
  assert.deepEqual((await provider.children('root')).map(i => i.id), ['a', 'b']);
  assert.equal(calls.filter(c => c.url.endsWith('/login')).length, 1);
  assert.equal(calls[2].body.variables.Token, 'fake-access');
});
test('repeated page cursors fail instead of looping', async () => {
  const { provider } = mock(() => ({ data: { getFileChildren5: { Items: [], NextToken: 'repeated' } } }));
  await assert.rejects(provider.children('root'), /repeated a page cursor/);
});
test('GraphQL errors are redacted and never recursively retried', async () => {
  const { provider, calls } = mock(() => ({ errors: [{ message: 'secret fake-access' }] }));
  await assert.rejects(provider.children('root'), err => err instanceof Error && !err.message.includes('fake-access') && /rejected/.test(err.message));
  assert.equal(calls.length, 3);
});
test('schema drift is an error, never an empty folder', async () => {
  const { provider } = mock(() => ({ data: { getFileChildren5: { files: [] } } }));
  await assert.rejects(provider.children('root'), /schema changed/);
});
test('missing recycle-bin state fails closed', async () => {
  const { IsInRecycleBin, ...incomplete } = wire('file');
  const { provider } = mock(() => ({ data: { getOverlay4: incomplete } }));
  await assert.rejects(provider.get('file'), /schema changed/);
});
test('numeric IDs are normalized without unsafe integer precision loss', async () => {
  const { provider } = mock(() => ({ data: { getOverlay4: { ...wire('1'), ID: 1 } } }));
  assert.equal((await provider.get('1')).id, '1');
});
test('adapter refuses a returned item with the wrong ID', async () => {
  const { provider } = mock(() => ({ data: { getOverlay4: wire('other') } }));
  await assert.rejects(provider.get('file'), /wrong item/);
});
test('provider URLs are validated before returning a download', async () => {
  const { provider } = mock(() => ({ data: { getOverlay4: { ...wire('file'), URL: 'http://169.254.169.254/latest/meta-data/' } } }));
  await assert.rejects(provider.download('file'), /not approved/);
});
test('successful overlay resolves only an approved HTTPS file link', async () => {
  const { provider } = mock(() => ({ data: { getOverlay4: { ...wire('file'), URL: 'https://files.example.com/f?sig=example' } } }));
  assert.equal(await provider.download('file'), 'https://files.example.com/f?sig=example');
});
