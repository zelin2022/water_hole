# Water Hole

A finite 2D excavation game built with TypeScript, Canvas, Vite, and Electron. Break layered terrain with deliberate pickaxe strikes, collect exposed water, climb back to the exchange, and improve your equipment. New expeditions reach **2000 metres** on the depth display.

The **demo release candidate** implements the agreed systems for playtesting and balance. Artifact searching belongs to the full game. New expeditions end at 600 cumulative water delivered with a thank-you screen; earlier saves retain their 400 limit. That limit is not presented as a mission. Online reports and surveys have a verified public receiver and Cloudflare edge rate limit; native package checks remain before release. See [the local release checklist](docs/DEMO_RELEASE.md).

## Run

Use Node.js 24 and npm.

```sh
npm ci
npm test
npm start
```

`npm start` builds and opens the desktop game. `npm ci` installs the Electron runtime along with development dependencies. For browser development:

```sh
npm run dev
```

Open the local URL Vite prints. Run `npm run desktop:dev` in a second terminal to use Electron with that development server.

## Playtest options

New Game always uses **three depth-weighted sizes**: small pockets hold **30–60** water, medium **60–120**, and large **120–240** (45/90/180 with ±15/30/60 variation). All three classes can appear at any depth. Their frequency weights are `r² : r : 1`, where `r = 3 × 0.9^((d − 50) / 100)` and `d` uses the HUD's depth units. At depth 50 this gives approximately 69% small, 23% medium, and 8% large pockets. Each volume is sampled uniformly as a whole number within its class, independently of the class choice. Larger finds become a little more common deeper down. The accessible starter is always small and also varies in volume; the total water varies by seed.

Every pocket, including the starter, independently has a **1-in-5 chance of starting dry**. Dry pockets have the same size and shape as their wet counterparts; the water detector responds only to actual water. Larger standalone hollow caves are deferred until after the demo.

The current and legacy many-small layouts each contain **198 pockets**; legacy fewer-large contains **135**. The two legacy layouts retain matched cavity-capacity budgets, totaling 20,640 before dry rolls; actual water varies with dryness. Save/load preserves each run's layout metadata and actual world. Existing saved maps keep their original dimensions, pockets, and machine placement; start a new expedition to obtain the deeper map. New Game starts with normal dark-cave vision and has no water-layout or full-visibility selectors; full visibility remains available in the gated developer panel.

Dark caves with temporary sonar outlines are now the standard. Explored caves become completely dark outside current illumination and active scan echoes. The headlamp follows mouse aim, and the worker's head visibly rotates with it. Older saves adopt these selected modes while keeping their terrain, water, equipment, and progress.

The exchange stands on an indestructible reinforced platform at the left map edge, with its foundation extending to the bottom. Its exposed right face stays climbable when nearby ground is removed, with no overhang at the top. Walk right across the surface to the starter shaft: its entrance is 480 world pixels beyond the platform edge, roughly two-thirds of a standard 1280-pixel game window at the current zoom. The shaft and starter pocket have moved together, keeping initial digging and climbing access intact. Airborne wall contact attaches only while falling. Hold S to descend after attaching, then work from the shaft floor to reach the first pocket; if it is dry, keep exploring. Digging while attached is disabled until the work-harness upgrade is purchased. Layout changes apply to new expeditions; loading an existing run preserves its stored terrain and machine.

Grounded walking automatically steps up and follows down small terrain changes, up to two cells (8 pixels). This is the selected behaviour, including for older saves made with one-cell steps. Stepping requires clear space above the character. Larger ledges and drops retain the normal jumping, climbing, and falling controls.

Clinging needs hand/torso contact backed by connected wall terrain. Uneven dug faces remain climbable: held grips follow shallow recesses and ledges, while foot-level bumps and isolated cells do not catch the character. The attached pose grips the wall with both hands before the harness upgrade, then visibly wields the pickaxe after installation. Underground darkness conceals the environment. Pale moonlight enters exposed openings and weakens in narrow shafts; warm head/torso lights reveal the nearby surroundings. Player lamps dim in strong ambient light and recover in darkness, including when aimed from the surface into a dark tunnel. Cave outlines need illumination or a temporary scan echo to appear.

A soft warm halo reveals solid terrain and mining damage just **four cells beyond the worker's body**, fading toward its edge. Each torso-lamp purchase extends it by 20%, giving 4, 4.8, then 5.76 cells (16, 19.2, then 23.04 world pixels). This small terrain reveal can penetrate the immediate rock face; water and sealed cave interiors remain hidden, and the terrain goes dark again when the worker moves away.

Cave sonar helps with wayfinding: its wave expands as a circle in open space, follows connected tunnels around bends, and briefly traces their walls. Terrain blocks the pulse, keeping sealed caves and water pockets hidden. Reveals appear quickly and fade over half a second; the cooldown remains 15 seconds. The earlier penetrating scan is preserved as the **Subsurface scanner**, reserved and hidden from the shop with no player control assigned. Existing Cave sonar purchases retain access to the new navigation pulse.

There are five diggable materials: **sand 1 HP, earth 3 HP, stone 6 HP, basalt 10 HP, and granite 16 HP**. Sand appears sparsely within sixteen metres of the local surface. Wavy basalt and granite deposits become more common deeper down, leaving mixed routes rather than complete upgrade barriers. Reinforced infrastructure and the map boundary are indestructible. Surviving strikes leave four progressive damage stages based on the fraction of material health lost: bruising, branching cracks, and increasingly chipped faces near breaking. These marks stay within the solid cell and obey underground lighting; they preserve the actual terrain and saved damage.

Detached earth or sand islands of up to three cells fall away and disappear on landing. The fragments do not block movement or displace water. Larger islands and harder materials stay intact.

## Default controls

| Input | Action |
| --- | --- |
| A / D | Move, including air steering |
| W / S | Climb up/down while attached |
| Space | Ground jump, wall jump, or purchased air jump |
| Direction away from the wall | Detach |
| Mouse + hold left click | Aim and repeat pickaxe strikes |
| Hold E | Collect nearby exposed water |
| F near the hopper | Start/stop gradual unloading |
| B near the exchange | Open the equipment shop |
| Q after installing cave sonar | Trace connected tunnel outlines |
| Escape | Pause / return from menus |

Climbing is unlimited and water is harmless. The shop offers mining, jumping, climbing, tank capacity, water detection/range, lamps, wall digging, and sonar. Mining has seven radius purchases (12 → 76 pixels), three damage purchases (1 → 6), and three speed purchases (0.48 → 0.16 seconds per swing). Stone takes 6, 3, 2, then 1 impact across the damage tiers. Radius prices are 15/20/30/45/65/90/125 credits; damage and speed each cost 30/55/95. The full mining set costs 750 credits, with shorter wind-ups at higher speed so strikes remain discrete. This exceeds the current 600-water cutoff, so the earlier goal of showcasing all three completed mining tracks needs another balance decision.

Jump power and climbing assist each offer **seven purchases** at 15/20/30/45/65/90/125 credits, costing 390 credits per complete track. Ground jump launch speed rises from approximately 159 to 1080 world pixels per second; climbing rises from 75 to 680. Gentler upward gravity preserves the starting jump height while slowing the initial ascent; falling retains its normal gravity. Purchased jump tiers use the stronger launch speeds and standard upward gravity. The **100-credit air jump** adds one extra jump before landing or gripping a wall. Wall grips recharge it, allowing repeated wall jump → air jump → reattach sequences. Their launch speed is tuned separately so optimized repeated ascent stays at or below climbing assist of the same upgrade tier. Mining, both mobility tracks, and air jump total 1,630 credits; the 600-water candidate cutoff requires equipment choices across runs. Numerical balance remains provisional.

Torso-lamp radius, headlamp width, and headlamp depth each offer **two purchases** at 35 then 70 credits, totaling 105 per track. Each level adds 20% to the previous value, reaching 44% above base. Torso purchases also extend the small terrain-only halo by the same percentage. Starting headlamp depth is reduced by 30% to 126 world pixels, and its full beam angle by 10% to 64.8 degrees. Torso radius starts at 55 pixels. Older saves without lamp levels receive unupgraded lamps while preserving their site and progress; the halo is derived from the restored torso level.

Tank capacity offers **nine purchases**, adding 20 water each time: 20 at the start, up to 200. Successive prices are 10/15/20/25/35/45/60/80/110 credits, totaling 400. Collection remains 36 water per second. Larger tanks unload faster, but take longer to empty: full-tank unloading time rises evenly from **0.8 seconds at 20 water to 1.6 seconds at 200**. Older capacity levels retain their 20/40/60 capacities and actual water and credits. The backpack's visible growth stays bounded at its previous maximum size.

Settings include display presets/fullscreen, music/SFX volume, and keybindings. Escape remains reserved for pause/menu navigation.

The original synthesized ambient music varies continuously with current depth and tank fill. Empty tanks favour exploration; fuller tanks bring in a returning motif, while lower tones build across the first 1600 metres. Layers blend smoothly rather than restarting the score when a boundary is crossed. Music and SFX keep separate volume controls.

Unavailable and fully installed upgrades are hidden. Eligible upgrades without enough credits show their price in red; the install button becomes available when funded. The water detector costs 60 credits and reveals two range purchases at 45 then 90; the work harness costs 80 and cave sonar costs 90. All visible equipment totals 2,710 credits. Purchased levels and existing credits remain intact when loading older saves; repricing gives no refunds.

The approved next progression rule starts with one visible upgrade track and reveals another track after each purchased level. Its track mapping and implementation remain pending; this price update keeps the current availability rules.

## Developer panel

Press the backtick key (`` ` ``) during an expedition to open the provisional developer panel. It also opens from pause or the equipment shop. Gameplay pauses while the panel is open; backtick, Escape, or Close panel returns to the previous screen.

The panel lets you toggle omni vision, set the current credit balance to a nonnegative amount up to 1 billion, and teleport to the hopper. Teleport prefers a clear supported position near the saved machine, resets motion and pending actions, and preserves the tank, water, credits, and terrain. If an older run has a floating machine, a clear airborne destination can be used; blocked destinations report failure. Changes are saved with the expedition. Development credits do not count as delivered water or advance the demo cutoff, and omni vision does not permanently explore the whole map.

The build flag `VITE_DEV_TOOLS=true` in `.env` enables these tools for current browser, desktop, and packaged playtests. `.env.release` disables them for `npm run build:release` and the release packaging commands below. A disabled build excludes the panel and hotkey, ignores saved omni-vision overrides, and uses the two-cell walking-step default. Restart the development server after changing the flag. Environment overrides take precedence over the `.env` files.

## Saving

One local slot supports manual Save/Load, Continue, autosaving every 30 seconds, and saving when returning to the menu or quitting. New Game confirms before replacing an expedition. Compact version 2 saves preserve terrain, partial damage, water, equipment, exploration, comparison choices, sonar/cutoff state, and whether the air jump has been spent. Version 1 saves still load with their actual world dimensions; missing jump equipment starts unpurchased, and loading does not replenish an airborne jump. Older saves without a stored delivery limit retain 400; new runs record 600. Browser development and the packaged desktop game use separate local storage.

## Reports and release identification

Press **F8** to pause and report a bug with an automatically captured game screenshot. Preview or remove the screenshot, describe the issue, and review the included game details. The shortcut is rebindable. Reports and screenshots can be downloaded; custom image uploads are absent. Drafts persist locally. The ending congratulates you and offers an optional five-star rating and suggestions. The gated developer panel includes **Warp to demo end** for testing it.

The client uses `VITE_FEEDBACK_API_URL=https://waterhole-feedback.epsiloneridanigames.com` from shared `.env`. Real human-verified screenshot reports and ending surveys have reached the private receiver through Cloudflare Tunnel. Sending requests a human check and submits only after an explicit player action; local copies/exports remain available if online reporting fails. Cloudflare edge rate limiting has passed on both submission paths. On 2026-10-16, the developer's packaged v0.1.25 game delivered text and in-expedition screenshot reports and a five-star ending survey with real server-validated human checks. The developer also confirmed cancellation, draft preservation, retry, and visible success. Feedback checks are complete for that tested package; the v0.1.26 price update still needs packaging, and broader native lifecycle and public release checks remain. See [feedback deployment and verification](docs/FEEDBACK.md) and [the separate receiver](feedback-server/README.md).

The optional compile-time `VITE_FEEDBACK_URL` can link to a separate HTTPS support page; it is not required for in-game submission. `VITE_STORE_URL` can point to the actual Steam page once it exists. Missing or invalid URLs leave the corresponding links absent; changing them requires a rebuild.

## Standalone packages

```sh
npm run package:win
npm run package:mac
npm run package:mac:x64
```

For public release candidates with developer tools disabled:

```sh
npm run package:win:release
npm run package:mac:release
npm run package:mac:x64:release
```

Outputs are under `release/`: Windows x64, macOS Apple Silicon, and macOS Intel respectively. Copy the whole Windows folder, then launch `Water Hole.exe`; Node and npm are not needed to run a package. Build macOS packages on the Mac. Current packages are unsigned and macOS signing/notarization remains release work. macOS packaging and playtesting have not been verified on this Windows host.

Without a spare machine, use a guest browser session against `npm run preview` after a release build for a fresh-storage UI check, and a separate regular browser profile for save/relaunch persistence. An optional fresh local OS account can isolate packaged-app data on the same hardware. The agent's earlier automated Windows launch was blocked by DeviceGuard and remains unverified; do not bypass that policy. The developer has successfully launched a packaged game and submitted feedback, but broader Windows/Mac lifecycle checks remain pending. See [the release checklist](docs/DEMO_RELEASE.md) for the concrete checks and their limits.

## Development

```sh
npm test
npm run build
npm run audit:economy
npm run benchmark
```

Development follows TDD: confirm a failing behaviour test, implement, then refactor with tests passing. Terrain, water, movement, progression, saving, lighting, sonar, and detection remain independent of Canvas/Electron. `npm test` also checks the desktop bridge/display contract and verifies that actual release JavaScript excludes developer tools. Controls and rendering receive browser/desktop playtests.

Use Node.js 24 for development: `npm test` now includes the separate feedback receiver's built-in SQLite tests. `npm run test:feedback` runs only those quick checks. The receiver is not bundled into the desktop game and requires no additional npm dependencies.

The economy audit checks purchase opportunities and seeded supply without predicting playtime. The short stress benchmark exercises deep tunnels, many water bodies, maximum mining, lighting and sonar, then writes per-operation timings, worker CPU/memory, and water-accounting metrics to gitignored `benchmark-results/`. It measures calculations rather than rendered frame rate; see [benchmark details](docs/BENCHMARK.md) and [economy review](docs/ECONOMY_REVIEW.md).

See [the demo scope](docs/DEMO.md), [art direction](docs/ART_DIRECTION.md), [local release checklist](docs/DEMO_RELEASE.md), and [Steam release preparation](docs/STEAM_DEMO_RELEASE.md). Steam page setup and demo upload follow local candidate preparation; no Steam release is claimed. The original [v0 scope](docs/V0.md) remains as milestone history.
