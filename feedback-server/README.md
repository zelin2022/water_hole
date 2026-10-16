# Local feedback service

This folder contains the demo's private feedback receiver, deployed behind an outbound Cloudflare Tunnel at `https://waterhole-feedback.epsiloneridanigames.com`. Real Turnstile-validated screenshot reporting, ending surveys, and public visitor-IP limiting have passed. The v0.1.25 client is configured for this origin; the edge rate rule and native packaged-game checks remain pending. See [deployment evidence and remaining work](../docs/FEEDBACK.md). No service secrets are included in the repository.

The existing AWS machine is a VPN/home-access gateway. Its TCP/UDP 443, UDP 585, SSH and restricted home-access ports remain reserved. Do not replace its reverse proxy, Docker networks, firewall, Tailscale configuration or VPN containers to host feedback.

## Runtime and local checks

Use Node.js 24. The service has no npm dependencies and uses Node's built-in HTTP, SQLite, crypto and zlib modules. The game and feedback service are separate processes. From the repository root:

```sh
node --test feedback-server/test/*.check.mjs
node feedback-server/start.mjs
```

The second command listens only on `127.0.0.1:3210`. With no configuration, `GET /health` works and submissions return 503. Tests inject an in-memory store and verification adapter into an ephemeral loopback server; that bypass is not exposed as a runtime flag.

A fresh deployment needs a stable HTTPS origin and a Turnstile widget for that hostname. Copy `.env.example` into a private file outside the repository, fill the required fields, and keep `SUBMISSIONS_ENABLED=0` until deployment checks pass. Set it to `1` only for live verification or operation. Node supports loading that private file with `node --env-file=/private/path/feedback.env feedback-server/start.mjs`. Keep the secret key server-side; the site key is public. Never put SSH keys or service secrets into the game, repository, reports or logs.

Required configuration: `PUBLIC_ORIGIN` (HTTPS origin with no path or credentials; a dedicated public HTTPS port such as 8443 is supported), `TURNSTILE_HOSTNAME` (exact matching hostname, without a port), `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, and explicitly `SUBMISSIONS_ENABLED=1`. Set `FEEDBACK_DB` to a private persistent directory. Runtime port changes must stay unprivileged; binding to all interfaces is not supported. `SUBMISSIONS_ENABLED=0` is the emergency switch; restart the process after changing environment variables. Supporting a public URL with a separate port does not open that port on the server.

A Cloudflare Tunnel is the selected hosting route; see [the hosting design and setup status](../docs/FEEDBACK.md#hosting-decision). Set `TRUST_PROXY=cloudflare-tunnel` **only** when that tunnel is the exclusive proxy path to the loopback port. Otherwise IP limits use the socket peer and ignore all forwarded-IP headers. Any additional local proxy must have a separately reviewed trusted-IP configuration. The generic templates in `deploy/` do not install or register anything themselves.

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

After the player chooses Send, the game embeds `PUBLIC_ORIGIN/verify?nonce=UUID&action=bug_report` or `action=demo_survey`. This page serves a real Turnstile widget using the public site key, then posts `{ type: "water-hole-feedback-verified", nonce, action, token }` to its parent. A configured public site key keeps this page available while submissions are closed; closing the API still prevents provider validation calls and inbox writes. Because Electron uses a file origin, the child uses `postMessage` with `*`; the parent **must** check the exact iframe window, HTTPS origin, fresh nonce and expected action before accepting the token. Successful verification completes that requested submission; cancelling keeps the draft local.

The server validates the token with Cloudflare's verification API and requires success, exact expected hostname/action, and an age of at most five minutes (allowing 30 seconds clock skew). Network errors, invalid JSON, rejected or expired tokens prevent insertion. Tokens are single-use; a retry after token expiry should obtain fresh verification while retaining its report UUID. No shared client secret exists. Managed Turnstile can finish automatically; the parent closes the verification dialog after accepting its callback, then submits the feedback and displays the API result.

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

For deployment, `deploy/` provides a receiver unit, a separate outbound tunnel unit, a shared resource slice, and namespaced journal settings. Create separate non-login users `waterhole-feedback` and `waterhole-tunnel`. Root owns `/opt/waterhole-feedback/`, with portable Node at `node/bin/node`, `cloudflared` alongside, and this repository's `feedback-server/` under `current/`. Install the `.service` and `.slice` files under `/etc/systemd/system/`. Install the journal configuration and logger resource drop-in at the paths stated in those files; leave global journal settings alone. The receiver's root-owned mode-0600 `/etc/waterhole-feedback/receiver.env` must specify `PORT=3210`, `FEEDBACK_DB=/var/lib/waterhole-feedback/feedback.sqlite`, the HTTPS/Turnstile values, and initially `SUBMISSIONS_ENABLED=0`. The root-owned mode-0600 tunnel token goes at `/etc/waterhole-feedback/tunnel-token`, loaded using systemd credentials rather than a command-line token.

The two unprivileged services have 128 MiB individual limits; the private logger has 32 MiB. Their shared slice caps the total at 256 MiB and half a CPU, with no swap expansion. The code filesystem is read-only and the receiver's mode-0700 state directory is private. Logs rotate with a 16 MiB persistent budget and 2 MiB files; this can exceed the budget by active-file granularity and is not a filesystem quota. Runtime logs have a separate fallback budget. No request bodies or tokens should be logged.

Before installing, check units with `systemd-analyze verify` on the target Linux host and verify downloaded runtime checksums against official vendor metadata. Exercise representative screenshots and concurrent requests under the actual caps before enabling public submissions. Contract tests check deployment policies, not live Linux service behavior. The current AWS deployment has passed these startup and bounded screenshot checks, real server-validated reports and surveys, and public visitor-IP limiting. Edge-rule and native client verification remain tracked in `docs/FEEDBACK.md`.

For a fresh host installation, `deploy/install-host.sh` accepts three paths: a source tar archive containing this repository's `feedback-server/`, a private receiver environment file, and a file containing only the tunnel token. Review the script, transfer these files into a private staging directory over verified SSH, and run it as root:

```sh
sudo bash install-host.sh source.tar receiver.env tunnel-token
```

The bootstrap pins and checks vendor runtime downloads, refuses an existing installation, installs the dedicated units, validates them, and starts with submissions disabled. It does not upgrade global packages, change public listeners, or alter the existing VPN/Docker/firewall configuration. Keep the staging directory private and remove its secret copies after installation. Installation is not complete until live service checks pass; enable submissions separately only after the real HTTPS and Turnstile path works.

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
