/** Operator-only, read-only live probe. Never invoked by a public HTTP route. */
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { ADAPTER_VERSION, DegooProvider, readDegooConfig, scopeHash } from '../lib/degoo';
import { buildSnapshot, requireEntry, assertFreshMembership } from '../lib/catalog';
import { safeFetch, readBounded } from '../lib/safe-download';
import { AppError, invariant } from '../lib/errors';

function flag(name: string) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; }
async function run() {
  if (process.argv.includes('--help')) {
    console.log('npm run verify:degoo -- --file-id <known-small-file-id> --sha256 <local-original-sha256>\nRequires server-only Degoo settings in .env.local. The sample must be non-empty and at most 8 MiB. No uploads or writes to Degoo are performed.');
    return;
  }
  const config = readDegooConfig();
  const provider = new DegooProvider(config);
  const origin = new URL(process.env.INDEX_ORIGIN || 'http://localhost:3000').origin;
  console.log('Checking the configured Public folder and all pages in its subtree…');
  const snapshot = await buildSnapshot(provider);
  const sampleId = flag('--file-id');
  const expected = flag('--sha256')?.toLowerCase();
  invariant(sampleId && expected && /^[a-f0-9]{64}$/.test(expected), 'PROBE_INPUT',
    'Listing passed. Supply --file-id and the SHA-256 of its known original file to verify downloads. No activation report was created.', 400);
  const sample = requireEntry(snapshot, sampleId);
  invariant(sample.kind === 'file' && sample.size > 0 && sample.size <= 8 * 1024 * 1024,
    'PROBE_INPUT', 'Choose a non-empty file in Public, at most 8 MiB.', 400);
  await assertFreshMembership(provider, snapshot, sampleId);
  const url = await provider.download(sampleId);
  console.log('Checking an unauthenticated storage GET and its exact SHA-256…');
  // No Degoo cookies, API key, or account token is sent to the storage host.
  const response = await safeFetch(url, config.hosts, { Origin: origin });
  const mime = response.headers.get('content-type') || '';
  invariant(!/text\/html/i.test(mime), 'PROBE_FAILED', 'Storage returned HTML instead of the test file.');
  const cors = response.headers.get('access-control-allow-origin');
  const bytes = await readBounded(response, 8 * 1024 * 1024);
  invariant(bytes.length === sample.size, 'PROBE_FAILED', 'Downloaded length does not match Degoo metadata.');
  invariant(createHash('sha256').update(bytes).digest('hex') === expected, 'PROBE_FAILED', 'Downloaded bytes do not match the original file. Live access remains locked.');
  const end = Math.min(1023, bytes.length - 1);
  const partial = await safeFetch(url, config.hosts, { Range: `bytes=0-${end}`, Origin: origin });
  const expectedRange = `bytes 0-${end}/${bytes.length}`;
  let range = false;
  if (partial.status === 206 && partial.headers.get('content-range') === expectedRange) {
    const slice = await readBounded(partial, 1024);
    range = slice.equals(bytes.subarray(0, end + 1));
  } else { await partial.body?.cancel(); }
  const report = {
    adapter: ADAPTER_VERSION, scope: scopeHash(config), verifiedAt: new Date().toISOString(),
    listing: true as const, downloadSha256: true as const, range, cors: cors === '*' || cors === origin
  };
  // Admin-controlled config evidence, not cryptographic authorization or a credential.
  await writeFile('compatibility-report.json', JSON.stringify({ ...report, checks: {
    indexedFiles: [...snapshot.entries.values()].filter(i => i.kind === 'file').length,
    mediaPlayback: 'not-tested', browserCors: 'header-observation-only',
    hostingRegion: 'Run this probe again from the actual deployment region before public launch.'
  } }, null, 2) + '\n', { mode: 0o600 });
  await writeFile('compatibility.env', `DEGOO_COMPATIBILITY=${Buffer.from(JSON.stringify(report)).toString('base64url')}\n`, { mode: 0o600 });
  console.log(`PASS: listing + known-file SHA-256. Range: ${range ? 'supported on the sample' : 'not confirmed'}. CORS headers: ${report.cors ? 'allow the configured origin' : 'not confirmed'}.`);
  console.log('Created compatibility-report.json and compatibility.env. Copy the generated setting to your server environment, then set INDEX_MODE=degoo. Report expires after 7 days.');
}
run().catch(error => {
  console.error(error instanceof AppError ? `${error.code}: ${error.message}` : 'PROBE_FAILED: network, configuration, or response parsing failed. No live activation report was issued.');
  process.exitCode = 1;
});
