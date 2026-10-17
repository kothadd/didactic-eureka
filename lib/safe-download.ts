import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { invariant, AppError } from './errors';

export function validateDownloadUrl(raw: string, hosts: string[]) {
  let url: URL;
  try { url = new URL(raw); } catch { throw new AppError('UNSAFE_URL', 'Provider returned an invalid download URL.'); }
  invariant(url.protocol === 'https:' && !url.username && !url.password && !url.hash &&
    (!url.port || url.port === '443') && hosts.includes(url.hostname) &&
    !isIP(url.hostname) && url.hostname.includes('.') && !url.hostname.endsWith('.local') &&
    !url.hostname.endsWith('.localhost'), 'UNSAFE_URL', 'Download host is not approved.');
  return url;
}

function publicIp(ip: string) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) ||
      (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)));
  }
  // Only global unicast IPv6; excludes loopback, mapped IPv4, link-local, ULA.
  return isIP(ip) === 6 && /^[23][0-9a-f]{3}:/i.test(ip) && !ip.toLowerCase().startsWith('2001:db8:');
}

export async function safeFetch(raw: string, hosts: string[], headers: Record<string, string> = {}) {
  let url = validateDownloadUrl(raw, hosts);
  for (let i = 0; i < 4; i++) {
    const addresses = await lookup(url.hostname, { all: true });
    invariant(addresses.length && addresses.every(a => publicIp(a.address)), 'UNSAFE_URL', 'Download host is not publicly routable.');
    let response: Response;
    try {
      response = await fetch(url, { headers, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(15000) });
    } catch { throw new AppError('DOWNLOAD_UNAVAILABLE', 'Storage could not be reached.'); }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      invariant(location, 'DOWNLOAD_UNAVAILABLE', 'Storage returned an invalid redirect.');
      url = validateDownloadUrl(new URL(location, url).href, hosts);
      continue;
    }
    return response;
  }
  throw new AppError('DOWNLOAD_UNAVAILABLE', 'Storage returned too many redirects.');
}

export async function readBounded(response: Response, maximum: number) {
  invariant(response.ok && response.body, 'DOWNLOAD_UNAVAILABLE', `Storage returned HTTP ${response.status}.`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      invariant(length <= maximum, 'TOO_LARGE', 'Response exceeds the permitted preview or probe size.', 413);
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks);
}
