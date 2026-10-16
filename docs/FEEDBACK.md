# In-game feedback

The v0.1.24 client and local receiver are implemented. Public submissions remain disabled: no production HTTPS origin or human-verification credentials have been configured, and the receiver has not been deployed. The server inventory was read without changing any service. SSH credentials and deployment-specific addresses are not stored in this repository.

## Player experience

Press **F8** during an expedition to pause and report a bug. This action is rebindable in Settings. Capture only the game canvas, downscaled to fit 1280 × 800 pixels, as a PNG up to 1 MiB. Show the image before submission and let the player remove it. There is no file picker or custom image-upload control. Reports include editable text and the existing reproducible game details. Capture or storage failures leave text reporting and local exports available.

The ending congratulates the player on beating the demo and offers an optional one-to-five-star rating and suggestions. The survey has no screenshot attachment. It does not resume the completed expedition. The developer panel's **Warp to demo end** transfers existing water into the completed-run ledger, preserving water and credits, then opens this ending for testing. Public release builds remove the warp control with the other developer tools.

Drafts stay locally until the player chooses Send. A configured build asks for a human check in a separate hosted verification frame, then sends the selected report or survey. Failed requests keep the draft. Repeating the same submission uses its existing UUID; changing its content creates a new UUID. Copy/download alternatives remain available while online reporting is unconfigured.

## Request path

```text
Game report or survey
  -> verification iframe on the configured HTTPS origin
  -> server-validated Turnstile token
  -> POST /api/reports or POST /api/surveys
  -> private, bounded SQLite inbox
```

Set `VITE_FEEDBACK_API_URL` to the HTTPS service origin when rebuilding the client. Build-time CSP grants network/frame access only to that configured origin. The game validates the verification frame's exact window, origin, request nonce and action before accepting its token. No shared secret is embedded in the game. The provider secret stays on the receiver; its server checks hostname, action, token age and verification success.

See [receiver configuration, API, limits and private inbox commands](../feedback-server/README.md). `npm test` includes receiver tests; Node.js 24 is required for the built-in SQLite runtime. `npm run feedback:start` starts the receiver on loopback with submissions disabled unless explicitly enabled and fully configured. It does not publish a port or configure infrastructure.

## Hosting decision

The available instance is an active VPN/home-access gateway with a small memory budget. Feedback deployment must use a separate unprivileged process or container with bounded CPU/memory and private storage, preserving the existing VPN containers, networks, SSH, Tailscale, and public listeners. No deployment commands have been run.

A domain has not been selected. Two practical choices remain:

1. **Register a domain and use Cloudflare Tunnel.** A persistent published tunnel requires a domain on Cloudflare. Its outbound connection can reach the loopback receiver without opening a new public inbound port. This is the preferred design for the shared gateway. See [Tunnel prerequisites](https://developers.cloudflare.com/tunnel/get-started/).
2. **Use an AWS-provided CloudFront hostname.** CloudFront provides HTTPS on its own `cloudfront.net` hostname, so buying a domain is optional. This needs AWS distribution/origin configuration and an origin route that does not use the VPN's 443 listener. Origin authentication, trusted client-IP handling and edge limits must be reviewed for this route; the current proxy-trust setting is specifically for an exclusive local Cloudflare Tunnel. See [CloudFront certificates](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesGeneral.html).

Direct-IP HTTPS is now possible with short-lived IP certificates, but would require certificate automation and a new public listener and would expose the shared gateway directly to feedback traffic. It is not the chosen deployment. [Let's Encrypt IP certificates](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability).

## Verification and remaining work

Client tests cover transport validation, drafts, screenshot bounds, keybindings and frame-message validation. Browser checks cover capture/removal, keyboard reporting, rating, developer warp, cancellation and retry. An integration check passes real captured PNGs through the local HTTP service into SQLite and verifies deduplication and survey storage. Only the external human-check provider is mocked in that integration; live Turnstile and native Electron compatibility are not established by it.

Before public submissions: choose the HTTPS hosting route; configure a real hostname, provider keys and client origin; deploy the isolated receiver with resource/disk limits; verify the real human check from the packaged Windows/Mac game; test rate limits and recovery without affecting gateway traffic; then rebuild public packages with developer tools disabled. Public connectivity and native testing remain pending.
