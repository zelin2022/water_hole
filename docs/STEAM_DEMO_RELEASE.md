# Steam demo release preparation

## Current status

A local provisional demo build and Windows packaging route exist. They are for playtesting, not an approved Steam release. Rebuild packages from the tested revision before uploading. Steam account setup, real AppIDs/depot IDs, store assets, trailer, uploads, installation testing through Steam, and Valve review remain external release work. This repository has not created Steam applications or uploaded a build.

Official documentation checked on 2026-10-15. Complete the current Steamworks dashboard checklists when preparing release.

## Local release candidate

- [ ] Finalize comparison defaults, progression, presentation, and the delivery cutoff after playtesting.
- [ ] Run `npm ci`, `npm test`, and `npm run build:release` on the release revision. Confirm `VITE_DEV_TOOLS` is disabled, with no overriding environment value enabling it. Verify that backtick cannot open a developer panel, New Game has no full-visibility checkbox, and saved omni-vision overrides cannot enable full visibility.
- [ ] Build Windows with `npm run package:win:release`. Distribute the complete `release/Water Hole-win32-x64/` folder, including its runtime files; the executable alone is insufficient.
- [ ] Test the packaged app on a clean Windows installation: new game, controls, upgrades, save/load after relaunch, audio/display settings, and the stopped demo ending.
- [ ] Build and test macOS natively before advertising macOS support:

```sh
npm ci
npm test
npm run package:mac:release       # Apple Silicon / arm64
npm run package:mac:x64:release   # Intel / x64, if supported for release
```

The expected bundles are `release/Water Hole-darwin-arm64/Water Hole.app` and `release/Water Hole-darwin-x64/Water Hole.app`. Current packaging does not configure signing or notarization. macOS cross-packaging was blocked by Windows symlink privileges; no Mac package or Mac QA is claimed. Decide the supported architectures, complete the signing/distribution work appropriate for release, and test on the actual target hardware.

## Steam account and applications

- [ ] Complete Steamworks agreements, identity/bank/tax setup, and the app fee. Check the account's actual release eligibility dates. [Onboarding](https://partner.steamgames.com/doc/gettingstarted/onboarding)
- [ ] Create/configure the base game, then use **Add Demo** from its associated applications page. Record the real base AppID, separate demo AppID, and depot IDs outside placeholder examples.
- [ ] Confirm the demo application type and base-game association. Prepare the base game's public Coming Soon page before releasing the demo ahead of the full game. [Demo configuration and release](https://partner.steamgames.com/doc/store/application/demos)

## Store preparation

- [ ] Choose whether to use the base game's demo button alone or an optional separate demo store page.
- [ ] Produce the required capsule/library artwork, descriptions, gameplay screenshots, trailer, system requirements, and content survey responses for the relevant dashboard checklists. Advertise only supported platforms and implemented features.
- [ ] If enabling a separate demo page, supply a demo-specific trailer and at least five demo screenshots, identify the app as a demo in its graphical assets, and describe the demo's actual content. [Demo store requirements](https://partner.steamgames.com/doc/store/application/demos)

## SteamPipe configuration and upload

- [ ] Configure installation and OS-specific launch options. If the Windows package contents are mapped directly to the install root, use the relative executable path `Water Hole.exe`, without a leading slash or dot. If the whole package folder is nested instead, include that folder in the relative path.
- [ ] For macOS, prefer the relative `Water Hole.app` bundle launch option once a tested bundle exists. Configure depots/package ownership for the platforms being shipped and publish those settings.
- [ ] Create SteamPipe app/depot build scripts using the **demo AppID**, actual depot IDs, and packaged content roots. Preview the file mappings before uploading; keep source, developer dependencies, local saves, and credentials out of the depot.
- [ ] Upload with an authorized Steamworks build account, set the candidate live on a test branch, and install/launch it through Steam. Confirm the complete runtime is installed and saves survive an update. [Uploading and launch configuration](https://partner.steamgames.com/doc/sdk/uploading)

## Review and release

- [ ] Complete the demo's Store Presence and Build checklists and submit the near-final candidate for review. Valve normally quotes 3–5 business days for each review; allow at least seven business days for review and possible fixes. Verify launch on every advertised OS and consistency between the store and build. [Review process](https://partner.steamgames.com/doc/store/review_process)
- [ ] Resolve review feedback, verify the approved candidate, and schedule the actual release using the dashboard controls.
- [ ] After releasing the demo, manually republish the base game's store page so its Download Demo button appears. Verify downloading, launching, and the end screen from a Steam installation. [Demo release steps](https://partner.steamgames.com/doc/store/application/demos)
