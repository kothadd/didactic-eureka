// Production HTTP smoke test for local machines / GitHub Actions.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const port = process.env.SMOKE_PORT || '3127';
const base = `http://127.0.0.1:${port}`;
let exited = false;
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', port, '-H', '127.0.0.1'], {
  stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, INDEX_MODE: 'demo', NEXT_TELEMETRY_DISABLED: '1' }
});
let startup = '';
child.stdout.on('data', b => { startup += b.toString(); });
child.stderr.on('data', b => { startup += b.toString(); });
child.on('exit', () => { exited = true; });
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (exited) throw Error(`Server exited during startup: ${startup.slice(0, 2000)}`);
    try { const response = await fetch(base, { signal: AbortSignal.timeout(1000) }); ready = response.ok; } catch {}
    if (ready) break;
    await new Promise(r => setTimeout(r, 250));
  }
  assert.ok(ready, 'Production server did not become ready');
  const html = await (await fetch(base)).text(); assert.match(html, /A place for everything/);
  const data = await (await fetch(`${base}/api/list`)).json(); assert.equal(data.mode, 'demo'); assert.equal(data.stats.files, 7);
  const result = await fetch(`${base}/api/download?id=welcome`, { redirect: 'follow' });
  assert.equal(result.status, 200); assert.match(await result.text(), /Welcome to the Public collection/);
  const privateFile = await fetch(`${base}/api/download?id=outside`); assert.equal(privateFile.status, 404);
  console.log('Production HTTP smoke test passed.');
} finally { child.kill('SIGTERM'); }
