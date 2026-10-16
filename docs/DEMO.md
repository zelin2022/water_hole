# Demo scope

The demo develops the excavation and water-selling loop into a presentable Steam release. Artifact searching and recovery belong to the full game. The provisional build is for comparing mechanics and tuning progression before finalizing the public demo.

## Agreed gameplay changes

- Attach to walls only while falling, never during the upward part of a jump. Require hand/torso contact backed by connected wall structure so foot-level ground bumps and isolated terrain cells do not catch the character. Dug faces need not be flat: held grips follow shallow recesses and protrusions using collision-checked horizontal adjustments. Preserve unlimited climbing, air steering, detachment, wall jumping, and protection against immediate reattachment, including getting over the top of a wall.
- Grounded walking automatically steps up and follows down small terrain changes. Start with a two-cell limit (8 world pixels on the current grid), with a one-cell comparison in the dev panel. Check clearance throughout the step and require supporting ground at the destination. Keep walking grounded on small descents; jumping, airborne movement, larger cliffs, and wall climbing retain their normal physics.
- Disable digging while attached to a wall initially. A purchased upgrade enables it.
- Replace continuous excavation with discrete pickaxe strikes. Holding the dig input repeats swings; each impact applies terrain damage, with time between impacts.
- Give terrain durability so harder material can require several strikes. Keep partial damage when leaving an area or saving.
- Use mouse position to choose digging direction rather than strike distance. The strike centre has a fixed distance from the character for a given digging radius, and that distance scales with radius. Tune the geometry against adjacent walls, floors, and narrow tunnels.
- Add terrain variety, smaller water pockets, and a slower, visible transfer of water into the hopper.
- Detached dirt islands of one to three cells fall and disappear on landing, clearing small floating obstacles. Shared-edge contact with other solid terrain anchors a dirt group. Larger islands and stone do not collapse. Falling fragments are nonblocking and do not displace water.
- Keep water accounted for across terrain, the tank, and the machine. Credit only the amount actually transferred, including interrupted transfers.

## Selectable comparison builds

Build both alternatives for each comparison. Make them selectable before starting a playtest; switching during gameplay is optional where practical. Keep the two choices independent so all combinations can be tested. Final public-demo defaults and whether both alternatives ship remain subject to playtesting.

| Comparison | Alternative A | Alternative B |
| --- | --- | --- |
| Explored cave visibility | Explored cave outlines remain dimly visible outside current illumination. | Explored caves become dark; sonar is needed to reveal their outlines. |
| Water pockets | Many small pockets create more separate discoveries. | Fewer large pockets provide more water per discovery. |

Both vision alternatives use a small light around the character plus a headlamp. Solid terrain conceals water. Sonar is included in the experimental build for the dark-cave alternative. It traces the outline of dug/excavated cave space from near to far as its expanding ring passes. Availability during comparison playtests still needs tuning; the original upgrade proposal is a one-time sonar purchase.

The headlamp comparison is resolved: the lamp follows mouse aim and the visible head rotates with that aim. Continue/load preserves the cave-memory and pocket-distribution choices. Older saves retain their world and switch character-facing lamps to mouse aim. Keep a development-only full-visibility option for testing.

### Depth-based water pockets

Both distributions use a small guaranteed starter pocket beside the shaft. Near the surface, small pockets are common; larger pockets become increasingly common deeper down. Keep size variation within each depth band. Give both presets the same water budget at each depth so discovery frequency and water per discovery can be compared without adding extra income to one preset. Keep the shallow supply below the demo cutoff to encourage deeper exploration. These are provisional pacing values, not final balance.

| Depth band | Many small: pocket count | Fewer large: pocket count | Water in either preset |
| --- | --- | --- | --- |
| Shallow, including the shared 45-unit starter | 8 | 4 | 240 |
| Middle | 10 | 5 | 600 |
| Deep | 10 | 7 | 1,100 |
| Total | 28 | 16 | 1,940 |

Bands use pocket centre rows below 120, 120–184, and 185 onward on the 256-row map. Seeded variation changes individual volumes and positions while preserving each band's budget. The next shallow pocket is near the starter in both presets. The new layouts apply to new expeditions; loading an earlier save keeps its existing pockets.

### Sonar timing

| Parameter | Starting value and behaviour |
| --- | --- |
| Wave travel | About 2 seconds from the character to beyond the viewing area |
| Outline appearance | Fast, almost immediate, when the wave reaches each outline segment |
| Outline lifetime | 0.5 seconds total per segment, including initial appearance and the slower fade |
| Cooldown | 15 seconds |

All timings remain tunable. Each outline segment starts its own appearance/fade when reached by the wave, so the reveal travels outward rather than flashing the whole cave at once. Outlines fade instead of remaining permanently mapped by sonar.

### Terrain responsive lighting

Daylight is stronger near sky-exposed terrain. Determine this exposure from the current excavated geometry rather than the original surface height. Opening a pit or shaft lets daylight enter and changes nearby lighting; covered tunnels become dimmer with distance and obstruction. Underground cut faces do not become independent daylight sources.

Use sky visibility and attenuated light spreading through connected open space as the initial model. Terrain blocks light, while headlamps and surrounding work light keep the immediate working area readable. Recompute affected lighting as excavation changes the terrain.

Keep illumination and remembered exploration distinct. Both comparison variants should have soft, workable local visibility. The sonar-dependent variant hides remote remembered cave outlines until pinged, rather than making the current working area oppressively black. Lighting must not expose water through solid rock.

Unlit environment is opaque darkness: cave space, rock, water, and their physical edges must not reveal the cave silhouette. Remembered mode adds only its faint explicit exploration outline; sonar mode adds an outline only while the ping passes. Light reveals and tints the actual environment, with pale white moon/sky light and warm yellow headlamp/torso light. Adding a light must never darken an already illuminated area. Narrow shafts attenuate sky light with depth; light updates when excavation changes sky exposure.

Player lamps become subdued where ambient light is stronger, restoring their strength as the surroundings darken. Evaluate this at each illuminated surface, so a headlamp aimed from daylight into a dark tunnel still works. The blend must not create a dark dip on the way toward the surface.

## Demo cutoff

Cumulative water delivered to the machine triggers a demo limit. Treat this as the boundary of the available demo, rather than a mission, contract, or in-world victory objective. Spending earned credits does not reduce the delivered total.

On reaching the limit, show "Thanks for playing the demo" and end gameplay. Do not continue the simulation behind the end screen. A completed save must restore the ended state. Tune the delivery threshold later; the end-screen navigation is still to be designed.

## Provisional upgrades

The following selection is approved for the provisional build and remains subject to tuning before the public demo is finalized.

| Upgrade | Form |
| --- | --- |
| Digging radius | Repeatable levels |
| Digging damage | Repeatable levels |
| Wall-climbing speed | Repeatable levels |
| Water tank capacity | Repeatable levels |
| Water detector radius | Repeatable levels; requires detector v1 |
| Water detector v1 | One purchase; points toward the closest water body within its radius, with no indicator when none is in range |
| Digging while attached to a wall | One purchase; disabled before purchase |

Start with roughly one or two purchased levels per repeatable track, then tune the level counts, prices, effects, and water distribution together. These are provisional bounds, not final caps. The shop must show the current stat, purchase effect, price, and affordability.

Hide unavailable upgrades, including unmet prerequisites and equipment with no remaining levels. Show eligible upgrades without enough funding with a red price such as "40 cr"; funded upgrades retain the install button. Keep the current prerequisites for this provisional build; the larger upgrade tree will be designed after the demo.

### Other upgrade ideas retained for tuning

These proposals remain available for discussion without being added to the initial upgrade selection. Sonar v0's mechanic is already included for the vision comparison; its availability or purchase arrangement in that build remains to be tuned.

| Candidate | Original proposed behaviour |
| --- | --- |
| Faster digging rate | Repeatable upgrade that reduces time between discrete pickaxe impacts |
| Higher jumping | Repeatable jump-height upgrade |
| Water tank suction speed | Repeatable upgrade that increases water collection speed |
| Headlamp width | Repeatable upgrade that widens the headlamp beam |
| Headlamp depth | Repeatable upgrade that extends the headlamp beam |
| Torso-lamp radius | Repeatable upgrade that increases surrounding illumination radius |
| Sonar cooldown | Repeatable upgrade that reduces cooldown; requires sonar |
| Double jump | One-time ability purchase |
| Water detector v2 | One-time purchase requiring v1; also indicates the water body's mass, with deeper colour for more water |
| Underground sonar v0 | Proposed one-time purchase; an outward ring reveals the dug cave outline from near to far, initially on a 15-second cooldown |

## Presentation and menus

- Follow [the art direction brief and generated reference](ART_DIRECTION.md): a weighty illustrated industrial cutaway, broad geological forms, subdued mineral colours, controlled teal water, a sturdy worker, and compact functional UI. Apply it to the character sprite, terrain, machine/hopper, other environmental assets, gameplay HUD, and purchase menu.
- Maintain material separation and substantial cut edges after arbitrary excavation, including awkward player-dug tunnels. Make water the visual centrepiece through readable volume, surfaces, and flow.
- Include visible pickaxe impacts, head rotation for the mouse-directed lamp, and visible equipment changes for major upgrades at gameplay scale.
- Use a distinct attached silhouette with hands gripping the wall and braced legs. Before the wall-dig upgrade the attached model has no wielded pickaxe; afterward it keeps one hand gripping and wields the pickaxe with the other.
- Add background music and SFX for core actions and feedback.
- Provide New Game, Save, Load, Continue, pause, and settings. Settings include resolution/window size, windowed/fullscreen mode, audio, and keybindings.
- Provisional builds include a backtick developer panel with omni vision, a set-credit-balance field, and a one-cell/two-cell walking-step comparison. Pause simulation while it is open, preserve tool changes in saves, and keep development credits separate from water delivered. Gate the panel and all visibility overrides behind `VITE_DEV_TOOLS`; release builds disable it and use the two-cell walking-step default. These are testing tools, not public-demo features.

Proposed production bounds are two terrain materials with different durability, one looping music track, a small core sound set, and one local save slot with autosaving. Save data must include changed terrain and damage, water, inventory, credits, upgrades, exploration, comparison modes, and demo cutoff state.

## Supporting work proposed for the demo

- Use a finite procedural site with reproducible seeds, a safe spawn, an accessible machine, and enough reachable water to support progression and the delivery limit. The starting route must work before the wall-dig upgrade is purchased.
- Add contextual control and interaction guidance. Check movement, digging geometry, visibility, water behaviour, and pacing across several generated sites.
- Package Windows and macOS builds that run without a development environment, and test installation, saving, controls, audio, and display settings in those builds.
- Prepare the Steam store and linked demo application, release assets, build configuration, installation testing, and review/release work.

Artifact placement, artifact signals, and artifact recovery are excluded from the demo. Additional traversal systems, liquids, biomes, survival mechanics, achievements, and cloud saving remain later work.

## Validation

Continue test-driven development: write a meaningful failing behaviour test, confirm the expected failure, implement the smallest change, then refactor with tests passing. Keep simulation and progression independent of rendering and Electron.

Test grounded stepping in both directions, ascent/descent caps, headroom, swept-path collisions, and jumping/airborne exclusions alongside falling-only attachment, detachment suppression, the wall-dig purchase restriction, strike timing and damage, fixed digging distance, upgrades, detector behaviour, water conservation during transfer, save/load, comparison-mode restoration, and the delivery cutoff. Test generated sites deterministically across seeds and both distributions: accessible starter water, separated bodies, depth-based volume variation, comparable budgets, and enough water for the demo. Preserve legacy saved worlds when adding new options.

Playtest both alternatives in each comparison, including their independent selection and save/load restoration. Check mouse-aimed lighting and visible head rotation, digging feel, readable darkness, discovery, movement, sound, menus, keybindings, and progression manually. Before finishing implementation changes, run `npm test` and `npm run build`, and playtest control/rendering changes in the browser or Electron.

## Provisional build tuning

The first implementation uses a 400-unit cumulative delivery cutoff, 0.48 seconds between pickaxe swings with a 0.12-second wind-up, and 25 water units per second of hopper transfer. Earth durability is 1 and stone durability is 3. All are starting values for playtesting.

Tune the core timings and delivery limit in `src/game/session.ts`, water-pocket budgets and sizes in `src/game/generation.ts`, upgrade effects/prices in `src/game/economy.ts`, material durability/reach in `src/game/digging.ts`, wall grip/contour tolerance and walking-step height in `src/game/player.ts`, and lighting/sonar in `src/game/vision.ts`. Held grips currently bridge up to 8 world pixels; walking steps default to two terrain cells; ambient lamp suppression is 0.85. New Game exposes cave-memory and water-distribution choices; builds with developer tools enabled also expose full visibility and the backtick panel's live step-height comparison. `npm run build:release` and the `package:*:release` commands use `.env.release` to disable those tools. The current presentation and original synthesized audio are a first pass toward the art brief.

Standalone Windows packaging is available. Native macOS packaging/QA, final balance and art refinement, and the [Steam release preparation](STEAM_DEMO_RELEASE.md) remain before the public demo release.
