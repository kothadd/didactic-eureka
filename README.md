# Degoo Public Index — MVP

A Next.js + TypeScript public file index, designed for Vercel and inspired by the browsing experience of [next-gdrive-index](https://github.com/mbahArip/next-gdrive-index).

**Delivery status:** runnable sample-data MVP; experimental Degoo integration is implemented but **not live verified**. It is intentionally locked until a read-only compatibility probe succeeds. No demo account credentials, access tokens, or signed storage URLs are included in this archive. No deployment was performed; the requested deliverable is source code in a ZIP.

## Run the working sample

Use Node.js 22.10+ (Node 24 also works) and npm.

```sh
npm ci
npm run dev:demo
```

Open `http://localhost:3000`. The yellow sample-data banner is intentional. Samples are local generated files, not content from the supplied Degoo account.

For a production build locally:

```sh
npm test
npm run typecheck
npm run build
npm run start:demo
```

No environment file is necessary for these demo commands. To use regular `npm run dev` / `npm start`, copy `.env.example` to `.env.local` and configure it. An unset `INDEX_MODE` returns a setup error; a failed live connection never silently switches to samples.

## What is implemented

| Feature | MVP behavior |
| --- | --- |
| Public access | No visitor sign-in; read-only index and download routes |
| Folders | Breadcrumbs, nested folders, URL state, browser back/forward |
| Search | Filename search recursively inside the current folder; search from Public for the whole collection |
| Download | Scoped file checks followed by a fresh storage redirect; no large-file proxy through Vercel |
| Preview | Raster image, browser-supported audio/video, escaped UTF-8 text/code/Markdown up to 512 KiB |
| Bulk | Select files/folders, recursively expand and deduplicate, export stable URL list or JSON manifest; up to 200 files |
| Cache | Atomic complete metadata snapshot, TTL 60 seconds (configurable 5–300), single-flight rebuild per process |
| UI | Responsive list/grid views, keyboard search shortcut, dialogs, empty/error/loading states |
| Validation | Boundary tests, mocked Degoo contract tests, route integration tests, build and CI workflow |

**Bulk means a download manifest, not a server-generated ZIP.** The source project itself is delivered as a ZIP. Use `aria2c -i downloads.txt` or another download manager; the JSON manifest also preserves logical folder paths. The plain URL list does not preserve directory structure or guarantee filenames: those depend on the storage response. Browser download links can open inline when the provider does not return `Content-Disposition: attachment`; use Save As in that case.

PDF/Office conversion, HTML/SVG rendering, uploads, edits, delete, account management, encrypted-vault decryption, and shared-link scraping are out of scope. Markdown is displayed as plain text. Audio/video codec and seeking support must be checked on actual media files.

## Degoo verification first

See [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) for the evidence and exact acceptance criteria. This version uses an **account-backed read-only adapter**, with Public as a pinned subtree. The public link is the deployed index URL. It does not claim that Degoo has a supported anonymous-folder API, and it cannot ingest arbitrary Degoo share URLs.

The adapter isolates source-reviewed candidate contracts for:

- `https://rest-api.degoo.com/login`
- `https://rest-api.degoo.com/access-token/v2`
- `https://production-appsync.degoo.com/graphql`, operations `GetFileChildren5` and `GetOverlay4`

These are undocumented integration points, **not confirmed working endpoints for this account or hosting region**. There is no endpoint guessing, alternate-login fallback, client impersonation, CAPTCHA handling, or anti-bot bypass. If the actual contract differs, the probe stops with a redacted error. Update the adapter against observed authorized behavior and re-test; do not loosen validation to manufacture a pass.

### Configure and check

1. Copy `.env.example` to `.env.local`. Keep that file private and out of version control.
2. In your normal Degoo session, identify the exact folder ID for the intended folder named **Public**, the current web-client API key, and exact storage hostname(s). Obtain these from observed requests; do not guess or reuse an old third-party client key blindly. This archive intentionally does not embed a client API key.
3. Set `DEGOO_EMAIL`, `DEGOO_PASSWORD` (or `DEGOO_REFRESH_TOKEN`), `DEGOO_API_KEY`, `DEGOO_ROOT_ID`, and `DEGOO_DOWNLOAD_HOSTS`. The email is required as the account identity even when a refresh token is used. Exact hosts only: `host.example.com`, comma-separated, no scheme, path, wildcard, or IP address.
4. Choose a known, non-empty original file already inside Public, at most 8 MiB. Record its file ID and calculate its original SHA-256 locally. The probe performs no uploads or mutations.

   PowerShell:
   ```powershell
   (Get-FileHash .\sample.txt -Algorithm SHA256).Hash.ToLower()
   ```
   Linux:
   ```sh
   sha256sum sample.txt
   ```

5. Run:
   ```sh
   npm run verify:degoo -- --file-id YOUR_SAMPLE_ID --sha256 YOUR_ORIGINAL_SHA256
   ```
   The command loads `.env.local`; credentials never appear in command arguments or output. A failed probe does not create a new activation report.
6. If listing, scoped access, full download size, and SHA-256 all pass, it writes `compatibility-report.json` and `compatibility.env`. Put the generated `DEGOO_COMPATIBILITY` value in your server environment and set `INDEX_MODE=degoo`. The report is bound to the adapter version, account identity, exact root, API key, and approved hosts. It expires after seven days. Re-run the probe after any change or expiry.
7. Validate browser previews and downloads from the intended Vercel region. A local probe cannot prove that Degoo accepts Vercel egress. Range and CORS results apply to the sampled object; actual browser playback remains a separate check.

The report is operator-controlled configuration evidence, not a signed security attestation. Do not manually fabricate it or expose an endpoint that issues it. Keep an old report out of the live environment after a failed re-verification.

## Vercel

1. Put this directory into your own Git repository and import it into Vercel.
2. Select Next.js, Node.js 22.x or 24.x, `npm ci`, and `npm run build`. The included `vercel.json` sets the framework and route duration budget.
3. For an initial sample deployment, set `INDEX_MODE=demo`.
4. For live operation, complete verification first and add the server-only variables from the previous section in Vercel's project environment settings. **Do not use `NEXT_PUBLIC_` for any Degoo setting.** Redeploy after configuration changes. Keep sensitive values out of build logs and pull-request environments.
5. Configure the intended production deployment for public visitor access. The app does not add a visitor password. Only the approved Public subtree should contain material intended for anyone with the index link.
6. Use the deployed production URL as the public link. Check folder traversal, recursive search, a download byte/hash comparison, and browser previews from that deployment before sharing it.

No Vercel credentials are needed to build this ZIP. The GitHub Actions workflow validates tests/builds; Vercel's Git integration handles deployment once you connect your repository. There is no paid-service dependency or external database in the MVP.

## Limits that matter

- Maximum snapshot: 5,000 entries including root; 100 folders; 32 levels; 25-second crawl budget. A larger/slower tree fails closed instead of producing incomplete search results. Pagination is followed, with bounded page/entry limits and repeated-cursor rejection.
- Next.js routes have a 60-second configured Vercel budget; individual provider HTTP calls time out after 10 seconds. Storage reads use a 15-second timeout. Account queries are serialized at one per second per process, with at most 20 queued queries. This does not provide a fleet-wide provider rate limit.
- The cache is in memory and is lost on cold start. Each Vercel instance can rebuild independently. For a large or busy index, add a durable scoped snapshot store, distributed single-flight lock and rate limiter, plus an out-of-band crawler. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- List/search/bulk metadata may reflect a move/delete until the TTL expires. Downloads recheck the live ancestor chain; cached membership alone is insufficient. Previously issued signed URLs can remain valid until Degoo expires them. Upstream changes between the final check and redirect cannot be made atomic by this client.
- Redirect responses and public metadata responses are `no-store`. Signed URLs are not persisted in the index cache. They necessarily become visible to the downloader.
- Only exact configured HTTPS storage hosts are accepted. Server-side text/probe reads validate each redirect and check public DNS addresses. The host allowlist is an operator trust boundary; never allow attacker-controlled or arbitrary wildcard hosts. DNS checks do not constitute a general-purpose rebinding-proof network sandbox.
- Download behavior, headers, bandwidth quotas, CORS, range support, and browser media compatibility belong to the provider and have not been assumed. No compatibility promise is made for encrypted or transformed Degoo storage objects.
- No distributed abuse limiter or operational monitoring is bundled. Configure Vercel's traffic controls before a high-traffic public launch. The MVP is bounded, but not a production-scale crawler.

## Project map

```text
app/ui/file-browser.tsx    public file explorer and preview dialogs
app/api/                  scoped list, download, text preview, bulk routes
lib/degoo.ts              experimental, isolated Degoo wire adapter
lib/catalog.ts            rooted crawl and fresh membership checks
lib/cache.ts              bounded-lifetime single-flight cache
lib/safe-download.ts      exact-host validation and bounded storage reads
lib/demo.ts                real local sample files, explicitly labeled
scripts/verify-degoo.ts   operator-only compatibility probe
tests/                    contract, scope, cache, and route tests
docs/                     architecture, evidence and handoff
```

This is an original implementation of the requested index experience. No source or assets from next-gdrive-index were vendored. See [NOTICE.md](NOTICE.md) for reference provenance and upstream licensing context.
