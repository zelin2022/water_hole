# Demo release candidate

The current candidate is **v0.1.23**. This document tracks the local demo preparation accepted for this pass. Steam account/page setup, demo upload, Valve review, and public Steam release follow later and will be handled by the developer. Artifact searching and further systems belong to the full version.

The requested 3–5-person pre-release playtest is omitted. A spare computer is not required for the local checks below. Public demo readiness is still conditional on the remaining items; a passing browser test or model benchmark does not verify a native package.

## Candidate changes and checks

- [x] Audit the first economy pass using `npm run audit:economy`. New expeditions stop at **600 cumulative water delivered**; saves created without a stored limit retain their original **400** limit, including completed runs. Upgrade prices and water generation remain unchanged. The delivery wall stays out of the mission UI. See [economy review](ECONOMY_REVIEW.md) for purchase opportunity, water supply, and assumptions; the arithmetic does not establish expected playtime. Final feel and pacing remain subject to developer playtesting.
- [x] Check the persistent **Demo + version** identification in gameplay, menus, and the ending screen against the package version.
- [x] Check creator/asset credits in the browser and validate the application icon files and package metadata. Native window/taskbar appearance remains part of native QA below. Keep the generated reference image's role limited to visual direction; it is not an implemented scene or marketing screenshot.
- [x] Check feedback/report access from home, pause, and the thank-you ending. The local report contains build version, seed, platform, relevant run state, and blank reproduction fields. Copying/downloading the report and exporting a save pass. Draft text survives closing/reopening the panel until changing expeditions. Exports require a player action; nothing is sent automatically.
- [ ] Choose a real feedback destination, configure `VITE_FEEDBACK_URL`, and verify its link in the built package. **This destination is still pending.** Report/save export prepares reproducible information but does not itself give players a place to submit it.
- [ ] Add the optional `VITE_STORE_URL` once the actual Steam page exists, then check the ending wishlist link. An absent store URL is expected before Steam setup and produces no placeholder link.
- [x] Run the short calculation benchmark and inspect timings, CPU load, observed memory, and conservation. Dated results are retained locally. Separately profile browser rendering in normal, deep-tunnel, and dense-water scenes.
- [x] Run `npm test`, `npm run build`, and `npm run build:release` on the candidate. Confirm release mode has no environment override setting `VITE_DEV_TOOLS=true`.
- [x] Build and inspect the public Windows package with `npm run package:win:release`. The app archive contains only compiled assets, desktop bridge, and package identity; source, tests, development dependencies, local saves, and credentials are absent.
- [x] Verify release backtick access is absent and an old omni-vision save cannot restore full visibility. Local provisional builds retain developer tools for ongoing tuning.
- [x] Check the frozen thank-you ending in the release browser build: no further simulation or delivery; feedback access works; loading a completed save returns to the ending; New Game starts a new expedition after its replacement confirmation. Also verify settings and saves survive closing/restarting a separate persistent browser profile.
- [ ] Complete a native Windows launch/settings/save/relaunch/update check, or explicitly restrict the candidate's distribution status until it is possible. **Native Windows QA remains unverified on this host:** the previous launch was blocked by DeviceGuard. Do not disable or bypass that policy for testing.
- [ ] Build and test natively on the existing MacBook before advertising macOS support. **Native Mac packaging/playtesting remains unverified from this Windows host.** Include only architectures that have been tested; unsigned app distribution and any signing/notarization work remain separate release considerations.

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

`VITE_FEEDBACK_URL` and `VITE_STORE_URL` are optional compile-time configuration. Set them to the actual public HTTPS destinations before the corresponding release build. Invalid or missing values leave those buttons absent. These are links opened only after a player click; the game has no automatic telemetry or report upload. Changing either value requires rebuilding and repackaging. Do not use a guessed URL or publish a nonworking placeholder as the feedback channel.

## Simple alternatives to a spare machine

Start with a browser smoke check on the same computer: run `npm run build:release`, then `npm run preview`, and open the printed local URL in an Edge/Chrome guest session. This gives the game fresh browser storage and exercises the compiled release UI without a development server or existing expedition. Check New Game, controls, equipment, settings, reports, and the ending. Guest storage is temporary; for save/relaunch persistence use a separate regular browser profile, or keep the guest session open while closing and reopening only the game tab. Browser checks do not verify Electron-specific fullscreen, file downloads, launch behavior, or packaging.

For a native test when the host permits launching the app, copy the **complete** `release/Water Hole-win32-x64/` folder to another ordinary folder and launch `Water Hole.exe` directly from File Explorer, with development servers closed. Keep the full runtime next to the executable. A fresh local OS account is an optional way to get separate app data and permissions on the same machine; it requires no additional hardware. Check a new save, quit/relaunch, changed audio/display/key settings, and replacing the package while preserving the account's app data. A separate account still uses the same OS/drivers and does not establish compatibility with other hardware. This host's DeviceGuard block remains a limitation, not a reason to weaken device policy.

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
