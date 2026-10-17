# Degoo compatibility evidence — 2026-10-17

## What was actually observed

| Check | Result |
| --- | --- |
| Reference repository README and package | Read successfully |
| Current third-party Degoo driver source | Read successfully; candidate auth/list/overlay contracts inspected |
| `https://app.degoo.com` from build environment | HTTP 403; cause not established |
| Degoo browser page | Login form loaded at `https://app.degoo.com/login` |
| Account authentication | Not completed; secure browser sign-in was cancelled |
| Supplied account's Public folder identity/contents | Not verified |
| Pagination against actual account | Not verified |
| Anonymous GET to a returned storage URL | Not verified |
| Actual file bytes, Range, CORS, media playback | Not verified |
| Vercel egress acceptance | Not tested; no deployment performed |

The HTTP 403 is not proof of a permanent Degoo incompatibility, bad credentials or bot protection. No such conclusion is made. The supplied account credentials were not written into source or artifacts. The live adapter has not been represented as working.

## Contract provenance

Source inspection of OpenList's current Degoo driver and the upstream Python Degoo client identified candidate operations:

| Candidate | Expected shape being tested |
| --- | --- |
| POST `/login` | Username, Password, GenerateToken → RefreshToken and/or Token |
| POST `/access-token/v2` | RefreshToken → AccessToken |
| GraphQL `GetFileChildren5` | ParentID, Limit, Order, NextToken → Items and NextToken |
| GraphQL `GetOverlay4` | ID object containing FileID → metadata and possible URL |

Files were inspected as research; upstream implementation code and embedded client keys were not copied into the project. The adapter treats these shapes as provisional and rejects schema mismatches. Root/device discovery quirks are deliberately avoided: the operator pins the exact Public folder ID.

Primary source implementations and platform references:

- https://github.com/mbahArip/next-gdrive-index
- https://github.com/OpenListTeam/OpenList/blob/main/drivers/degoo/util.go
- https://github.com/OpenListTeam/OpenList/blob/main/drivers/degoo/driver.go
- https://github.com/OpenListTeam/OpenList/blob/main/drivers/degoo/types.go
- https://github.com/bernd-wechner/Degoo/blob/master/degoo/API.py
- https://vercel.com/docs/functions/limitations

These URLs track moving branches. Review date: 2026-10-17. Their existence is not a provider compatibility guarantee.

## Acceptance criteria for live activation

The included `npm run verify:degoo` probe must pass:

1. Successful authorized authentication or refresh using server-only secrets.
2. Exact pinned root exists, is an active folder, and is named Public.
3. All pages of the bounded subtree are readable with consistent parent IDs and no duplicate/cyclic IDs.
4. Known sample file belongs to that subtree, including a fresh ancestry check.
5. File overlay returns an HTTPS URL on an explicitly approved storage host.
6. A storage GET without Degoo account credentials returns non-HTML bytes within the probe limit.
7. The response size equals metadata and SHA-256 equals the original file's known hash.

The probe additionally records whether a real byte-range request returns 206, a matching Content-Range and the correct slice, plus the CORS response header for the configured app origin. These optional observations do not substitute for browser checks and are not inferred from HTTP 200 or an `Accept-Ranges` header alone.

Before public launch, manually test image/audio/video previews and file seeking with representative real formats, long filenames, non-ASCII names, a multi-page folder, nested folders, and a file larger than the function payload limit. Repeat from the actual deployment region. Check live moves/deletes, token refresh, expired links and upstream throttling. Do not mark these tests complete based on fixture tests.

## If verification fails

Keep `INDEX_MODE=demo` or leave the live site unavailable. Preserve only redacted failure metadata: status class, operation name and schema mismatch, never passwords/tokens/cookies/signed URLs. Compare the adapter with requests observed during an authorized normal Degoo session. If the response requires encrypted-file reconstruction, unsupported cookies, CAPTCHA or other browser-only behavior, report the limitation rather than inventing another endpoint or claiming direct-download support.
