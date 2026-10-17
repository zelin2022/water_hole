# Demo release candidate

The current source candidate is **v0.1.28**, with a **2000-metre depth ending**, the approved upgrade reveal order, and unchanged prices. Its Windows x64 and macOS arm64/x64 release archives are built and structurally inspected. Native feedback evidence below belongs to **v0.1.25**; broader native lifecycle checks for the current packages remain pending. This document tracks the local demo preparation accepted for this pass. Steam account/page setup, demo upload, Valve review, and public Steam release follow later and will be handled by the developer. Artifact searching and further systems belong to the full version.

The requested 3–5-person pre-release playtest is omitted. A spare computer is not required for the local checks below. Public demo readiness is still conditional on the remaining items; a passing browser test or model benchmark does not verify a native package.

## Candidate changes and checks

- [x] Historical v0.1.25 economy pass: audit a 600-water ending, retaining 400 for earlier saves. This former delivery wall was replaced by depth completion in v0.1.28; its audit did not establish expected playtime or final balance.
- [x] Apply the approved v0.1.26 prices: visible equipment totals 2,710 credits, mining totals 750, and mining with the first tank purchase and harness totals 840. Equipment effects, saved levels, actual water, and credits remain unchanged. See [economy review](ECONOMY_REVIEW.md) for current purchase opportunity, water supply, and assumptions.
- [ ] Finish upgrade economy tuning before release using normal starting-equipment playthroughs without developer credits. The depth ending removes the 600-water cap, allowing the complete mining showcase, but a fully upgraded descent does not establish normal progression pacing. Check early purchases, repeated collection/return trips, equipment choices, and the final descent with wet and dry starts. The numerical audit does not complete this step.
- [x] Implement the approved v0.1.27 reveal progression: start with radius, then reveal damage, detector, climbing, tank, jump power, speed, sonar, harness, double jump, headlamp depth, torso lamp, detector range, and headlamp width. Every visible purchased level counts. Skip detector range until detector ownership, retain owned legacy tracks and maxed-track order, and keep the scanner hidden. Existing save fields derive progression. The economy audit reports blocked fixed plans and a separate valid mixed progression example.
- [x] Implement the approved v0.1.28 depth ending: new expeditions finish at 2000 HUD metres, active shallow historical maps finish at their preserved bottom, and completed historical delivery runs stay frozen. No delivery cap or mandatory equipment purchase remains. Development ending warp moves to the bottom without consuming water or changing credits. The 64-seed audit labels 400/600/800 as delivered-water budgets, allows spending after their final transfer, and separately checks unlimited-budget valid progression.
- [x] Check the persistent **Demo + version** identification in gameplay, menus, and the ending screen against the package version.
- [x] Check creator/asset credits in the browser and validate the application icon files and package metadata. Native window/taskbar appearance remains part of native QA below. Keep the generated reference image's role limited to visual direction; it is not an implemented scene or marketing screenshot.
- [x] Check F8 bug reporting, automatic game screenshot preview/removal, report/save exports, and locally persisted drafts. Check the congratulations ending's five-star/suggestions survey and gated developer ending warp. Local HTTP/SQLite integration passes with the human provider mocked.
- [x] Deploy the bounded HTTPS receiver through Cloudflare Tunnel, configure real Turnstile keys and `VITE_FEEDBACK_API_URL`, and verify real server-validated screenshot reports and ending surveys from an opaque-origin browser context. Public visitor-IP limits and forged-header rejection also pass. See [feedback deployment evidence](FEEDBACK.md).
- [x] Configure and verify the Cloudflare edge rate rule for `/api/reports` and `/api/surveys`. A bounded GET burst produced Cloudflare HTML 429 on both paths, left `/health` available, and returned to ordinary JSON 404 responses after the block expired. No submissions or provider calls were made.
- [x] Verify actual text report and five-star ending survey delivery from the developer's packaged v0.1.25 game with real server-validated human checks. Both reached the private inbox on 2026-10-16 without screenshots. This establishes those submission paths in the tested package, not complete platform support.
- [x] Verify an in-expedition screenshot report from the packaged game, human-check cancellation, draft preservation, retry, and visible success confirmation. On 2026-10-16, the receiver stored the v0.1.25 report with a validated canonical PNG of 47,093 bytes, and the developer explicitly confirmed the native UI checks. Feedback verification is complete for the tested package.
- [ ] Add the optional `VITE_STORE_URL` once the actual Steam page exists, then check the ending wishlist link. An absent store URL is expected before Steam setup and produces no placeholder link.
- [x] Run the short calculation benchmark and inspect timings, CPU load, observed memory, and conservation. Dated results are retained locally. Separately profile browser rendering in normal, deep-tunnel, and dense-water scenes.
- [x] Historical v0.1.25 validation: `npm test`, `npm run build`, and `npm run build:release` passed with all 493 tests. The release bundle excluded developer controls; no environment override enabled them.
- [x] Historical v0.1.26 validation: `npm test`, `npm run build`, and `npm run build:release` passed with all 497 tests (456 Vitest, 8 desktop, and 33 receiver tests), and both builds passed. The release-browser shop displayed the approved starting prices. Native v0.1.26 packages were not rebuilt.
- [x] Historical v0.1.27 validation: `npm test`, `npm run build`, and `npm run build:release` passed with all 505 tests (464 Vitest, 8 desktop, and 33 receiver tests), and both builds passed. The 64-seed economy audit respected reveal gates. Browser testing confirmed the single initial radius track, no reveals from developer credits alone, immediate reveals in the approved first-seven order including a repeated radius purchase, and restored equipment, balance, and order after reload. The release browser started radius-only and backtick could not open developer tools. Native v0.1.27 packages were not rebuilt.
- [x] Validate v0.1.28: `npm test` passes all 513 tests (472 Vitest, 8 desktop, and 33 receiver); `npm run build` and `npm run build:release` pass. The audit regression and 64-seed supply/purchase audit pass. Browser testing loaded an actual active v0.1.27 save, warped to 2000 metres with its zero delivered water and 123 credits unchanged, and displayed the congratulations/survey. Release reload/Continue restored that completed depth and balance; movement and backtick did not resume gameplay or expose developer tools. Bug-report diagnostics showed delivered water without a delivery cutoff and a 2000-metre boundary. The source tests and release build passed again when preparing the inspected archives below; native launch/lifecycle checks remain pending.
- [x] Build and inspect the v0.1.25 public Windows package using the release build and `node scripts/package.mjs win32 x64`. Its archive contained only compiled assets, desktop bridge, and package identity, with the configured feedback origin and no developer controls, source, tests, development dependencies, local saves, or credentials. This is historical package evidence; native lifecycle checks remain pending below.
- [x] Build and inspect the v0.1.28 Windows release package. Executable/product version, AMD64 architecture, depth ending, approved prices/reveal order, feedback origin, icon, and release-only ASAR contents pass inspection. Developer controls and private/development files are absent. The complete runtime is archived and CRC-checked.
- [x] Build and inspect the v0.1.28 macOS arm64 and x64 release archives. Both contain the same inspected game ASAR and correct app/helper metadata. Official runtime Mach-O bytes, executable modes, all 14 framework symlinks, and required notices are preserved. Every archive record passes CRC and safe-path checks. These are unsigned/unnotarized app bundles requiring macOS 13 or newer; native launch checks remain pending.
- [x] Verify release backtick access is absent and an old omni-vision save cannot restore full visibility. Local provisional builds retain developer tools for ongoing tuning.
- [x] Historical ending/lifecycle browser check: no further simulation or delivery; feedback access works; loading a completed save returns to the ending; New Game starts a new expedition after its replacement confirmation. Settings and saves also survived closing/restarting a separate persistent browser profile. Recheck the new depth ending in the v0.1.28 validation above.
- [ ] Complete a native Windows launch/settings/save/relaunch/update check, or explicitly restrict the candidate's distribution status until it is possible. **Native Windows QA remains unverified on this host:** the agent's earlier automated launch was blocked by DeviceGuard. Do not disable or bypass that policy for testing. The developer's successful packaged-game launch and feedback submissions do not establish the remaining Windows lifecycle checks.
- [ ] Complete native Mac settings/save/relaunch/update and public-package checks before advertising macOS support. The developer's packaged-game feedback submissions establish the tested delivery paths, not complete Mac compatibility or a tested CPU architecture. Include only architectures that have been tested; unsigned app distribution and any signing/notarization work remain separate release considerations.

## v0.1.28 release archives

Built from gameplay revision `2614f6e` with Electron `44.7.2` on 2026-10-16. The files are local artifacts under the gitignored `release/` directory; they have not been uploaded to Steam or published as GitHub releases.

| Archive | Bytes | SHA256 |
| --- | ---: | --- |
| `Water-Hole-v0.1.28-Windows-x64.zip` | 158,146,135 | `f34c77c31d66b2f05761fcc85bb1205513efa0063f74a9b4e5ccc74cc266193e` |
| `Water-Hole-v0.1.28-macOS-arm64.zip` | 130,604,939 | `77c39db97a5ecd10576c9033f7e652b69f85005f34901ae143cf568543506b62` |
| `Water-Hole-v0.1.28-macOS-x64.zip` | 134,303,934 | `f26de4b0dbdaf97a9e1a94ad2f538b2d2e3096f670f981215e884f6a80c25d7c` |

`SHA256SUMS-v0.1.28.txt` and `package-verification-v0.1.28.json` accompany them. All three include identical `app.asar` bytes with SHA256 `2220230fa4ed8e06d0638145b2351a545e53c1c79a3dd6632203cf69f53219cc`. Its explicit file allowlist contains only compiled game assets, the desktop shell/preload, and trimmed package metadata. Version, feedback endpoint, 2000-metre ending, prices/reveal order, and absence of developer-panel code were inspected.

The Windows package uses the existing release packager. This host cannot create the Mac framework symlinks, so both Mac ZIPs were assembled directly from checksum-validated official Electron archives without extracting those links on Windows. App/helper names, plists, icon, and game resources were updated consistently with the installed packager. Independent inspection confirmed 583 safe, unique archive records per Mac build, all 14 resolving framework links with original Unix metadata, and all 13 architecture-correct Mach-O binaries unchanged from their official inputs. Transfer the ZIP intact and extract it on the Mac. No Windows security settings were changed, and no native executable was launched for this packaging pass.

These checks establish package structure and release configuration. Developer signing, Mac notarization, actual native launch/Gatekeeper behavior, settings/save/relaunch/update checks, economy playthroughs, and Steam installation remain separate work.

## Quick commands

```sh
npm ci
npm test
npm run build
npm run audit:economy
npm run benchmark
npm run package:win:release
```

`audit:economy` is a short deterministic purchase/supply audit. `benchmark` runs four intense model cases with finite iteration/time budgets, rather than a long idle soak: an actual generated site, a complete-depth tunnel and sonar, many falling/connected water bodies, and maximum mining with lighting-cache invalidation. It writes local JSON and Markdown reports under `benchmark-results/`. See [benchmark details and metric limits](BENCHMARK.md).

Use the **`:release` package commands** for the public candidate. The regular `package:win`/`package:mac` commands intentionally produce provisional builds whose current `.env` enables the developer panel. Release mode reads `.env.release`, which disables it; shell environment values take precedence, so check overrides when building.

Shared `.env` configures `VITE_FEEDBACK_API_URL=https://waterhole-feedback.epsiloneridanigames.com` for in-game reports and surveys. Rebuild and repackage after changing it. Both paths have passed real Turnstile server validation, storage checks, and Cloudflare edge rate limiting. Packaged v0.1.25 text and screenshot reporting, five-star survey delivery, cancellation, draft preservation, retry, and visible success also passed on 2026-10-16. Those results remain valid for the tested package. The v0.1.28 archives are inspected; broader native lifecycle and public release checks remain listed above. The optional `VITE_FEEDBACK_URL` links to a separate HTTPS support page, while `VITE_STORE_URL` can link to the actual Steam page once available. Missing or invalid optional URLs leave those buttons absent. Feedback sends only after the player chooses Send; there is no automatic report upload.

## Simple alternatives to a spare machine

Start with a browser smoke check on the same computer: run `npm run build:release`, then `npm run preview`, and open the printed local URL in an Edge/Chrome guest session. This gives the game fresh browser storage and exercises the compiled release UI without a development server or existing expedition. Check New Game, controls, equipment, settings, reports, and the ending. Guest storage is temporary; for save/relaunch persistence use a separate regular browser profile, or keep the guest session open while closing and reopening only the game tab. Browser checks do not verify Electron-specific fullscreen, file downloads, launch behavior, or packaging.

For a native test when the host permits launching the app, copy the **complete** `release/Water Hole-win32-x64/` folder to another ordinary folder and launch `Water Hole.exe` directly from File Explorer, with development servers closed. Keep the full runtime next to the executable. A fresh local OS account is an optional way to get separate app data and permissions on the same machine; it requires no additional hardware. Check a new save, quit/relaunch, changed audio/display/key settings, and replacing the package while preserving the account's app data. A separate account still uses the same OS/drivers and does not establish compatibility with other hardware. The agent's earlier automated Windows launch was blocked by DeviceGuard; do not weaken device policy to retry it.

Use the existing MacBook for the Mac check. From a fresh checkout of the tested revision:

```sh
npm ci
npm test
npm run package:mac:release       # Apple Silicon
# Or npm run package:mac:x64:release for an Intel Mac
```

Open the resulting `Water Hole.app` on that Mac, then perform the same launch, display/audio/key settings, save/relaunch, and package-update checks. Do not claim Mac support based only on cross-packaging from Windows or a browser run.

## After local preparation

The developer will set up the Steam game page and demo application, upload the tested candidate, and complete the Steamworks requirements. The existing [Steam preparation notes](STEAM_DEMO_RELEASE.md) remain a reference for that separate stage. Steam store artwork, screenshots, supported-platform claims, real AppIDs/depot IDs, and review are still pending. Public feedback should feed a small demo bug-fix pass before full-version work expands the scope.
