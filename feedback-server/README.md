# Local feedback service

This folder contains the demo's private feedback receiver. It is prepared and tested locally; it is **not deployed** and does not make the AWS gateway public. No production endpoint or secret is included.

The existing AWS machine is a VPN/home-access gateway. Its TCP/UDP 443, UDP 585, SSH and restricted home-access ports remain reserved. Do not replace its reverse proxy, Docker networks, firewall, Tailscale configuration or VPN containers to host feedback.

## Runtime and local checks

Use Node.js 24. The service has no npm dependencies and uses Node's built-in HTTP, SQLite, crypto and zlib modules. The game and feedback service are separate processes. From the repository root:

```sh
node --test feedback-server/test/*.check.mjs
node feedback-server/start.mjs
```

The second command listens only on `127.0.0.1:3210`. With no configuration, `GET /health` works and submissions return 503. Tests inject an in-memory store and verification adapter into an ephemeral loopback server; that bypass is not exposed as a runtime flag.

A future deployment needs a stable HTTPS origin and a Turnstile widget for that hostname. Copy `.env.example` into a private file outside the repository, fill the required fields, and explicitly set `SUBMISSIONS_ENABLED=1`. Node supports loading that private file with `node --env-file=/private/path/feedback.env feedback-server/start.mjs`. Keep the secret key server-side; the site key is public. Never put SSH keys or service secrets into the game, repository, reports or logs.

Required configuration: `PUBLIC_ORIGIN` (HTTPS origin with no path or credentials; a dedicated public HTTPS port such as 8443 is supported), `TURNSTILE_HOSTNAME` (exact matching hostname, without a port), `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, and explicitly `SUBMISSIONS_ENABLED=1`. Set `FEEDBACK_DB` to a private persistent directory. Runtime port changes must stay unprivileged; binding to all interfaces is not supported. `SUBMISSIONS_ENABLED=0` is the emergency switch; restart the process after changing environment variables. Supporting a public URL with a separate port does not open that port on the server.

A future Cloudflare Tunnel may connect outbound to the loopback service while keeping the public gateway ports unchanged. Set `TRUST_PROXY=cloudflare-tunnel` **only** when that tunnel is the exclusive proxy path to the loopback port. Otherwise IP limits use the socket peer and ignore all forwarded-IP headers. Any additional local proxy must have a separately reviewed trusted-IP configuration. This repository does not configure a tunnel, domain, firewall, container or system service.

## Player protocol

- `POST /api/reports`: `{ idempotencyKey, version, message, diagnostics, screenshot?, turnstileToken }`.
- `POST /api/surveys`: `{ idempotencyKey, version, rating, suggestions?, diagnostics?, turnstileToken }`.
- `idempotencyKey`: a client-generated UUIDv4, reused for retrying the same submission.
- `screenshot`: `null` or `{ mimeType: "image/png", data: "base64 bytes without a data-URL prefix" }`. The game captures it; its UI does not accept custom files. The server nevertheless treats every byte as hostile.
- Rating must be an integer from 1 to 5. Reports require nonempty text. Maximum message/suggestions length is 10,000 characters; diagnostics is 16,000; version is 32; token is 2,048. Unknown fields are rejected.
- Success returns 201 `{ id, received: true }`; an identical verified retry returns 200 with the same ID. Reusing an ID for different content returns 409.
- Errors return a short machine code. Rate limiting returns 429 with `Retry-After` seconds. Storage or verification-service unavailability fails closed.
- No cookies, player accounts, tracking IDs or application access logs are used. IPs stay only in the bounded in-memory limiter. The database does not store IPs or verification tokens.

The anonymous API permits Electron's `Origin: null` and optional explicitly listed HTTPS game origins. CORS is not authentication; direct callers can forge headers and screenshot content. The Turnstile result and server-side limits provide the abuse controls.

## Hosted verification

After the player chooses Send, the game embeds `PUBLIC_ORIGIN/verify?nonce=UUID&action=bug_report` or `action=demo_survey`. This page serves a real Turnstile widget using the public site key, then posts `{ type: "water-hole-feedback-verified", nonce, action, token }` to its parent. Because Electron uses a file origin, the child uses `postMessage` with `*`; the parent **must** check the exact iframe window, HTTPS origin, fresh nonce and expected action before accepting the token. Successful verification completes that requested submission; cancelling keeps the draft local.

The server validates the token with Cloudflare's verification API and requires success, exact expected hostname/action, and an age of at most five minutes (allowing 30 seconds clock skew). Network errors, invalid JSON, rejected or expired tokens prevent insertion. Tokens are single-use; a retry after token expiry should obtain fresh verification while retaining its report UUID. No shared client secret exists.

## Bounded resource use

Defaults prioritize preserving the gateway:

| Limit | Default |
|---|---|
| Bind address | IPv4 loopback only |
| Active sockets / concurrent submissions | 32 / 4 |
| Request headers / header bytes | 32 / 8 KiB |
| Body / idle / total body-read limit | 1,500,000 bytes / 5 seconds / 8 seconds |
| Eligible submission attempts per IP / global | 10/hour / 360/hour |
| IP limiter entries | 4,096, expired entries reclaimed |
| PNG bytes / dimensions | 1 MiB / 1600 by 1200, at most 1.92 million pixels |
| PNG chunk count / format | 64 / RGB8 or RGBA8, noninterlaced |
| Stored rows / data budget | 5,000 / 256 MiB |
| Retention | 90 days, pruned on startup and new inserts; manual prune available |

Rate, concurrency, content type and body limits run before JSON parsing, PNG inflation, network verification or persistence. Unknown critical PNG chunks, bad CRCs, trailing bytes, invalid row filters and incorrect inflation lengths are rejected. Inflation is bounded to the exact dimension-derived byte count. Images are rebuilt from checked scanlines with only IHDR/IDAT/IEND chunks, removing metadata and ancillary payloads. The PNG subset intentionally rejects unsupported encodings rather than attempting a general image decoder.

SQLite uses a small 2 MiB cache and a page-count cap. Its journal can temporarily consume additional disk space; reserve free disk beyond the 256 MiB database cap. Do not locate the database on the gateway's critical filesystem without a separate disk budget. This is a small single-service inbox, not a high-availability deployment. Back up the private database while the service is stopped or with SQLite's backup facility; never copy a changing database as though it were a consistent backup.

For future deployment, test under a dedicated unprivileged account or container with a 128 MiB memory cap, no swap expansion, at most half a CPU, a private writable data directory, a read-only code filesystem, and no published Docker ports or host-network changes. Confirm that real screenshot sizes fit those caps before enabling public submissions. Keep only bounded, rotated operational logs; do not log bodies/tokens. These are proposed deployment constraints, not changes made to the AWS host.

A rotating-IP attack can still exhaust the global budget, temporarily blocking legitimate feedback. Attempts already blocked by their IP limit do not consume the remaining global allowance. Every IP-eligible attempt counts before payload parsing or verification, including malformed reports. The budget protects the host; it cannot guarantee availability. Edge rate limiting plus Turnstile should be configured before public launch. The emergency switch closes submissions without deleting existing reports.

## Private inbox

There are no public list, report-read, image-download or admin routes. Review locally after SSHing in, with the same private `FEEDBACK_DB` path:

```sh
node feedback-server/admin.mjs list
node feedback-server/admin.mjs show REPORT_UUID
node feedback-server/admin.mjs status REPORT_UUID reviewed
node feedback-server/admin.mjs status REPORT_UUID resolved
node feedback-server/admin.mjs screenshot REPORT_UUID /private/path/report.png
node feedback-server/admin.mjs prune
```

Screenshot export refuses to overwrite an existing file. Statuses are `new`, `reviewed`, `resolved`, `spam`. Submitted content is plain text. Do not render it as raw HTML in a future inbox UI.

Relevant deployment references: [Turnstile server-side verification](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/), [Cloudflare Tunnel origin protection](https://developers.cloudflare.com/fundamentals/security/protect-your-origin-server/), [Node SQLite API](https://nodejs.org/api/sqlite.html).
