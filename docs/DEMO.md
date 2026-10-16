# Demo scope

The demo develops the excavation and water-selling loop into a presentable Steam release. Artifact searching and recovery belong to the full game. The provisional build is for comparing mechanics and tuning progression before finalizing the public demo.

## Agreed gameplay changes

- Attach to walls only while falling, never during the upward part of a jump. Require hand/torso contact backed by connected wall structure so foot-level ground bumps and isolated terrain cells do not catch the character. Dug faces need not be flat: held grips follow shallow recesses and protrusions using collision-checked horizontal adjustments. Preserve unlimited climbing, air steering, detachment, wall jumping, and protection against immediate reattachment, including getting over the top of a wall.
- Grounded walking automatically steps up and follows down small terrain changes. Two cells (8 world pixels on the current grid) is the selected limit; remove the one-cell developer comparison and normalize older one-cell saves to two cells. Check clearance throughout the step and require supporting ground at the destination. Keep walking grounded on small descents; jumping, airborne movement, larger cliffs, and wall climbing retain their normal physics.
- Disable digging while attached to a wall initially. A purchased upgrade enables it.
- Replace continuous excavation with discrete pickaxe strikes. Holding the dig input repeats swings; each impact applies terrain damage, with time between impacts.
- Give terrain durability so harder material can require several strikes. Keep partial damage when leaving an area or saving.
- Use mouse position to choose digging direction rather than strike distance. The strike centre has a fixed distance from the character for a given digging radius, and that distance scales with radius. Tune the geometry against adjacent walls, floors, and narrow tunnels.
- Add terrain variety, smaller water pockets, and a slower, visible transfer of water into the hopper.
- Detached dirt islands of one to three cells fall and disappear on landing, clearing small floating obstacles. Shared-edge contact with other solid terrain anchors a dirt group. Larger islands and stone do not collapse. Falling fragments are nonblocking and do not displace water.
- Keep water accounted for across terrain, the tank, and the machine. Credit only the amount actually transferred, including interrupted transfers.
- Put the exchange on a small reinforced platform at the left map boundary, supported by an indestructible foundation down to the map bottom. Its right face must remain climbable with initial equipment and meet the platform without an overhang. Keep the diggable map connected to its right. New expeditions use this placement; older saved worlds retain their actual terrain and machine.
- Each pocket independently starts dry with probability 1/5, including the starter and both legacy layouts. Dryness uses a separate seeded draw from size, volume, and placement. Keep cavity geometry identical whether wet or dry, and keep the water detector truthful. Remove the three separate pre-carved hollow caves; broader hollow-cave design belongs after the demo.

## Water-pocket comparison

Default new expeditions to the three-size depth-weighted distribution. Keep the earlier many-small and fewer-large layouts selectable as labeled legacy comparisons, and preserve the chosen layout in saves. The final public-demo distribution remains subject to playtesting.

| Comparison | Alternative A | Alternative B |
| --- | --- | --- |
| Legacy water layouts | Many small pockets create more separate discoveries. | Fewer large pockets provide more water per discovery. |

Dark caves with temporary sonar outlines are the selected vision mode. A small light around the character and a mouse-aimed headlamp illuminate the immediate working area. Outside illumination and active echoes, all cave outlines stay dark, including previously explored ones. Solid terrain conceals water. Cave sonar is a navigation tool: its wave travels through connected open space, follows tunnels around bends, and briefly traces adjacent wall outlines. Terrain blocks propagation, including diagonal corner gaps. Sealed cavities and water pockets remain hidden. It works on the current cave geometry without permanently exploring or illuminating it.

Retain the original penetrating radial scan as the **Subsurface scanner**, a separate reserved item. Its pulse can trace sealed cavities, including water-pocket outlines, through terrain. Hide it from the shop and reject purchases until its design is finalized; no player keybinding is assigned. Save its pulse/cooldown separately from Cave sonar. Existing Cave sonar ownership carries over to the new navigation mechanic, and older saves receive an unowned, inactive scanner.

The headlamp comparison is also resolved: the lamp follows mouse aim and the visible head rotates with that aim. Remove both vision comparison selectors. Continue/load preserves the pocket distribution; older saves adopt dark caves and mouse-aimed lamps while retaining their world, exploration data, equipment, and progress. Keep a development-only full-visibility option for testing.

### Three-size depth-weighted pockets

The default layout uses three size classes with variable water volumes:

| Class | Nominal volume | Variation | Inclusive range |
| --- | --- | --- | --- |
| Small | 45 | ±15 | 30–60 |
| Medium | 90 | ±30 | 60–120 |
| Large | 180 | ±60 | 120–240 |

Every procedural pocket can be any class at any depth; equipment does not unlock classes. Sample its volume uniformly as an integer within the selected range, using a separate random draw from the class selection. The accessible starter is always small and also varies from 30 to 60 water; keep its left edge and floor alignment fixed so the initial tool can always reach it. The touching endpoints 60 and 120 can belong to either adjacent class.

At depth `d`, use the same frequency ratio between adjacent size classes:

```text
r(d) = 3 * 0.9^((d - 50) / 100)
small / medium = medium / large = r(d)
small : medium : large = r(d)^2 : r(d) : 1
```

Normalize those weights before sampling each pocket independently. Depth uses the HUD's metres: pocket centre row minus the starter surface row (44), rather than world pixels. The finite map has 28 pockets including the starter, with at least 840 units of cavity capacity before dry rolls. Actual water varies by seed and independently sampled dryness; do not condition draws on a water budget or force a size or wet quota into each depth band, which would change the requested odds.

| Depth | Small chance | Medium chance | Large chance |
| --- | --- | --- | --- |
| 0 | 70.6% | 22.3% | 7.1% |
| 50 | 69.2% | 23.1% | 7.7% |
| 200 | 64.8% | 25.3% | 9.9% |

The curve produces a gentle shift over the current map's roughly 210-metre depth. All sizes are possible in shallow ground; a particular seed need not contain all three shallow sizes. Keep the starter route and nearby second pocket accessible, and preserve sealed separation from caves, other pockets, and boundaries. These initial volumes remain tunable.

Shallow water supply now varies with both class draws and volume variation. Tune pocket density or the demo cutoff after playtesting rather than altering the requested class probabilities to enforce a budget.

### Legacy depth-band comparisons

The two earlier comparison layouts retain their original volume variation and identical cavity-capacity budget at each depth. Independent dry rolls reduce actual water below these capacities. Their shallow supply stays below the demo cutoff to encourage deeper exploration. They are benchmarks for playtesting the new formula, with provisional pacing values.

| Depth band | Many small: pocket count | Fewer large: pocket count | Capacity in either preset |
| --- | --- | --- | --- |
| Shallow, including the shared 45-unit starter | 8 | 4 | 240 |
| Middle | 10 | 5 | 600 |
| Deep | 10 | 7 | 1,100 |
| Total | 28 | 16 | 1,940 |

These legacy bands use pocket centre rows below 120, 120–184, and 185 onward on the 256-row map. Seeded variation changes individual volumes and positions while preserving each band's capacity budget before dry rolls. The next shallow pocket is near the starter in both presets. Layout changes apply to new expeditions; loading an earlier save keeps its existing pockets.

### Sonar timing

| Parameter | Starting value and behaviour |
| --- | --- |
| Wave travel | About 2 seconds over the captured travel range; distance follows open tunnels |
| Outline appearance | Fast, almost immediate, when the wave reaches each outline segment |
| Outline lifetime | 0.5 seconds total per segment, including initial appearance and the slower fade |
| Cooldown | 15 seconds |

All timings remain tunable. Each reachable outline segment starts its own appearance/fade when reached by the wave. Draw the Cave sonar wavefront only inside reachable open cells. Outlines fade instead of remaining permanently mapped by sonar. Recompute propagation when excavation changes connectivity. Exploration history never adds permanent outlines over darkness.

### Terrain responsive lighting

Daylight is stronger near sky-exposed terrain. Determine this exposure from the current excavated geometry rather than the original surface height. Opening a pit or shaft lets daylight enter and changes nearby lighting; covered tunnels become dimmer with distance and obstruction. Underground cut faces do not become independent daylight sources.

Use sky visibility and attenuated light spreading through connected open space as the initial model. Terrain blocks light, while headlamps and surrounding work light keep the immediate working area readable. Recompute affected lighting as excavation changes the terrain.

Keep illumination and exploration history distinct. Give the current working area soft, workable local visibility; distant unlit outlines require sonar. Lighting must not expose water through solid rock.

Unlit environment is opaque darkness: cave space, rock, water, and their physical edges must not reveal the cave silhouette. Scan echoes add temporary outlines as the ping passes. Light reveals and tints the actual environment, with pale white moon/sky light and warm yellow headlamp/torso light. Adding a light must never darken an already illuminated area. Narrow shafts attenuate sky light with depth; light updates when excavation changes sky exposure.

Player lamps become subdued where ambient light is stronger, restoring their strength as the surroundings darken. Evaluate this at each illuminated surface, so a headlamp aimed from daylight into a dark tunnel still works. The blend must not create a dark dip on the way toward the surface.

## Demo cutoff

Cumulative water delivered to the machine triggers a demo limit. Treat this as the boundary of the available demo, rather than a mission, contract, or in-world victory objective. Spending earned credits does not reduce the delivered total.

On reaching the limit, show "Thanks for playing the demo" and end gameplay. Do not continue the simulation behind the end screen. A completed save must restore the ended state. Tune the delivery threshold later; the end-screen navigation is still to be designed.

## Provisional upgrades

The following selection is approved for the provisional build and remains subject to tuning before the public demo is finalized.

| Upgrade | Form |
| --- | --- |
| Digging radius | Seven purchases beyond base |
| Digging damage | Three purchases beyond base |
| Digging speed | Three purchases beyond base; reduces swing interval and proportionally scales wind-up |
| Wall-climbing speed | Repeatable levels |
| Water tank capacity | Repeatable levels |
| Water detector radius | Repeatable levels; requires detector v1 |
| Water detector v1 | One purchase; points toward the closest water body within its radius, with no indicator when none is in range |
| Digging while attached to a wall | One purchase; disabled before purchase |
| Cave sonar | One purchase; temporarily traces connected tunnel walls for navigation |

Mining deliberately reaches exaggerated capability within the demo. Other repeatable tracks retain their current two-purchase bounds. The shop must show the current stat, purchase effect, price, and affordability. Values remain provisional.

| Track | Base and successive values | Successive prices (cr) |
| --- | --- | --- |
| Radius (world pixels) | 12, 16, 20, 26, 34, 44, 58, 76 | 10, 15, 20, 25, 30, 35, 40 |
| Damage per impact | 1, 2, 3, 6 | 10, 15, 25 |
| Seconds between swings | 0.48, 0.34, 0.24, 0.16 | 10, 20, 30 |

Wind-up is one quarter of the current swing interval. Stone has 6 durability, taking 6/3/2/1 impacts across the four damage tiers so every purchase reduces the required hits. Earth stays at 1 durability. All mining purchases total 285 credits; adding the first capacity upgrade and work harness brings that to 385, below the 400-water demo cutoff. Maximum upgrades must still respect terrain shielding, reinforced foundations, water accounting, and the requirement for a harness when digging on a wall. Existing radius/damage levels keep their stats and partial terrain damage; older saves without speed upgrades receive level zero.

Hide unavailable upgrades, including unmet prerequisites and equipment with no remaining levels. Show eligible upgrades without enough funding with a red price such as "40 cr"; funded upgrades retain the install button. Keep the current prerequisites for this provisional build; the larger upgrade tree will be designed after the demo.

### Other upgrade ideas retained for tuning

These proposals remain available for discussion without being added to the initial upgrade selection. Cave sonar is already included as a one-time navigation upgrade; its balance remains subject to tuning.

| Candidate | Original proposed behaviour |
| --- | --- |
| Higher jumping | Repeatable jump-height upgrade |
| Water tank suction speed | Repeatable upgrade that increases water collection speed |
| Headlamp width | Repeatable upgrade that widens the headlamp beam |
| Headlamp depth | Repeatable upgrade that extends the headlamp beam |
| Torso-lamp radius | Repeatable upgrade that increases surrounding illumination radius |
| Sonar cooldown | Repeatable upgrade that reduces cooldown; requires sonar |
| Double jump | One-time ability purchase |
| Water detector v2 | One-time purchase requiring v1; also indicates the water body's mass, with deeper colour for more water |
| Subsurface scanner | Reserved and hidden; preserves the original penetrating cavity-outline scan pending further design |

## Presentation and menus

- Follow [the art direction brief and generated reference](ART_DIRECTION.md): a weighty illustrated industrial cutaway, broad geological forms, subdued mineral colours, controlled teal water, a sturdy worker, and compact functional UI. Apply it to the character sprite, terrain, machine/hopper, other environmental assets, gameplay HUD, and purchase menu.
- Maintain material separation and substantial cut edges after arbitrary excavation, including awkward player-dug tunnels. Make water the visual centrepiece through readable volume, surfaces, and flow.
- Include visible pickaxe impacts, head rotation for the mouse-directed lamp, and visible equipment changes for major upgrades at gameplay scale.
- Use a distinct attached silhouette with hands gripping the wall and braced legs. Before the wall-dig upgrade the attached model has no wielded pickaxe; afterward it keeps one hand gripping and wields the pickaxe with the other.
- Keep the quiet original synthesized background music and SFX. Add compatible exploration and returning motifs that blend continuously with current tank fill, and lower/deeper layers with current depth. Use smooth transitions without song restarts at thresholds, retain phrase variation, and preserve independent music/SFX controls.
- Provide New Game, Save, Load, Continue, pause, and settings. Settings include resolution/window size, windowed/fullscreen mode, audio, and keybindings.
- Provisional builds include a backtick developer panel with omni vision, a set-credit-balance field, and teleport to the actual saved hopper. Teleport finds a clear nearby position, prefers floor support, resets motion and pending actions, and preserves terrain and resource ledgers. Allow a clear airborne destination for unsupported legacy hoppers; report failure when all nearby positions are blocked. Reject completed runs. Pause simulation while the panel is open, preserve tool changes in saves, and keep development credits separate from water delivered. Gate the panel and all visibility overrides behind `VITE_DEV_TOOLS`; release builds remove them. These are testing tools, not public-demo features.

Proposed production bounds are two natural terrain materials with different durability plus reinforced infrastructure, one original adaptive synthesized score, a small core sound set, and one local save slot with autosaving. Save data must include changed terrain and damage, water, inventory, credits, upgrades, exploration, comparison modes, and demo cutoff state.

## Supporting work proposed for the demo

- Use a finite procedural site with reproducible seeds, a safe spawn, an accessible machine, and enough reachable water to support progression and the delivery limit. The starting route must work before the wall-dig upgrade is purchased.
- Add contextual control and interaction guidance. Check movement, digging geometry, visibility, water behaviour, and pacing across several generated sites.
- Package Windows and macOS builds that run without a development environment, and test installation, saving, controls, audio, and display settings in those builds.
- Prepare the Steam store and linked demo application, release assets, build configuration, installation testing, and review/release work.

Artifact placement, artifact signals, and artifact recovery are excluded from the demo. Additional traversal systems, liquids, biomes, survival mechanics, achievements, and cloud saving remain later work.

## Validation

Continue test-driven development: write a meaningful failing behaviour test, confirm the expected failure, implement the smallest change, then refactor with tests passing. Keep simulation and progression independent of rendering and Electron.

Test grounded stepping in both directions, ascent/descent caps, headroom, swept-path collisions, and jumping/airborne exclusions alongside falling-only attachment, detachment suppression, the wall-dig purchase restriction, strike timing and damage, fixed digging distance, upgrades, detector behaviour, water conservation during transfer, save/load, comparison-mode restoration, and the delivery cutoff. Test generated sites deterministically across seeds and all three distributions: initial tool reach when the starter is wet, separated cavities, depth-based volume variation, comparable legacy capacity budgets, independent 20% dry rolls including the starter, and sufficient actual water across sampled sites. Verify reinforced support cannot be removed or damaged, blocks strikes, survives save/load, and remains climbable from the map bottom onto the platform after excavation. Test sonar around bends, sealed pockets, both faces of thin walls, diagonal gaps, excavation changes, timing/fade and cooldown. Verify the retained scanner penetrates independently while its purchase stays hidden. Preserve legacy saved worlds and equipment when adding new options or items.

Test the formula's adjacent ratios, normalized probabilities, sampling thresholds, and aggregate generated-pocket frequencies. Verify independent volume variation, inclusive class bounds, varying starter volumes with reliable initial reach, separation of maximum 240-unit pockets, and water conservation after liquid stepping. Playtest the new default and both legacy layouts, including selection and save/load restoration. Check that explored unlit caves stay dark before and after sonar fades, including when loading an older remembered-outline save. Check mouse-aimed lighting and visible head rotation, digging feel, readable darkness, discovery, movement, sound, menus, keybindings, and progression manually. Before finishing implementation changes, run `npm test` and `npm run build`, and playtest control/rendering changes in the browser or Electron.

Verify all 7/3/3 mining purchases, capped prices, attainable total cost, discrete upgraded swing timing and animation, distinct stone hit counts, maximum-radius terrain shielding, and foundation/water preservation. Round-trip maximum equipment and partial stone damage; migrate absent speed metadata and one-cell saves. Test teleport support/clearance, legacy hopper placement, blocked/completed rejection, action resets, unchanged resource ledgers, autosaving, and removal from release bundles. Test smooth continuous audio scene weights, phrase variation, independent gain controls, silent startup, interrupted fades, skipped overdue beats, and node cleanup; playtest live tank/depth changes and music mute/pause.

## Provisional build tuning

The implementation uses a 400-unit cumulative delivery cutoff, 0.48 seconds between initial pickaxe swings with a 0.12-second wind-up, and 25 water units per second of hopper transfer. Speed purchases reduce both swing interval and wind-up, ending at 0.16/0.04 seconds. Earth durability is 1 and stone durability is 6. All are starting values for playtesting.

Tune the core timings and delivery limit in `src/game/session.ts`, three-size volumes/probabilities in `src/game/water-pockets.ts`, reservoir placement and legacy budgets in `src/game/generation.ts`, upgrade effects/prices in `src/game/economy.ts`, material durability/reach in `src/game/digging.ts`, wall grip/contour tolerance and walking-step height in `src/game/player.ts`, and lighting/sonar in `src/game/vision.ts`. Held grips currently bridge up to 8 world pixels; walking steps use two terrain cells; ambient lamp suppression is 0.85. Music phrases, scene weights, and blend time live in `src/music.ts`, with audio scheduling and gain ramps in `src/audio.ts`. New Game exposes the water-distribution choice; builds with developer tools enabled also expose full visibility and the backtick panel's teleport and credit controls. `npm run build:release` and the `package:*:release` commands use `.env.release` to disable those tools. The current presentation and original synthesized audio are a first pass toward the art brief.

Standalone Windows packaging is available. Native macOS packaging/QA, final balance and art refinement, and the [Steam release preparation](STEAM_DEMO_RELEASE.md) remain before the public demo release.
