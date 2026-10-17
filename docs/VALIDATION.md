# Validation report

Date: 2026-10-17.

## Passed in the build environment

- `npm ci` dependency installation is supported by the supplied exact lockfile. Initial dependency installation completed with npm.
- `npm test`: **26 tests passed**, zero failed. Includes catalog boundaries, live ancestry changes, pagination, malformed/secret-bearing errors, URL validation, TTL cache behavior, download/preview/list/bulk route integration, range serving, traversal rejection, invalid JSON, cross-origin bulk rejection and live-mode fail-closed behavior.
- `npm run typecheck`: passed.
- `npm run build`: optimized Next.js production build passed. One app page plus five API routes.
- `node scripts/smoke.mjs`: **production HTTP smoke passed**, including the rendered home page, listing, followed download, correct local file contents and an out-of-scope rejection.
- `npm run verify:degoo -- --help`: probe entry point executed successfully without credentials.
- `npm audit --omit=dev --audit-level=high`: reported **0 vulnerabilities** at validation time. This is a point-in-time dependency check, not a general security certification.

Runtime used: Node.js 24.19.0, npm 11.9.0. Next.js 16.4.2, React 19.3.1, TypeScript 7.0.2. See package-lock.json for the full resolved dependency set.

## Not verified

- Live account authentication, Public folder discovery, real Degoo listing/download bytes, actual provider media Range/CORS, or Vercel egress. See COMPATIBILITY.md.
- Browser visual/interaction QA: a supported local browser QA surface was unavailable in this environment. The responsive UI was compiled and route/HTTP tests ran, but no pixel or interactive-browser test is claimed.
- Large libraries, concurrent multi-instance production load, provider quota exhaustion, complete media codec coverage, and deployment configuration in a real Vercel account.

The automated tests use local fixtures and mocked wire responses. They verify our implementation's handling of that contract; they do not prove the provider currently implements it.

## Follow-up acceptance checklist

1. Run the compatibility probe using a known original file and pin the correct Public root/hosts.
2. Verify real pagination, descendant search, moved/deleted file rejection and token expiry behavior.
3. Deploy to Vercel with server-only environment settings; confirm region-specific access and direct download behavior.
4. Test responsive layout, keyboard navigation, dialogs, browser back/forward, selection, and actual image/audio/video/text previews in desktop and mobile browsers.
5. Add shared snapshots and distributed rate limits before increasing crawl limits or public traffic.
