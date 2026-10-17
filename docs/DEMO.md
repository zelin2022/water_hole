# Demo scope

The demo develops the excavation and water-selling loop into a presentable Steam release. Artifact searching and recovery belong to the full game. The provisional build is for comparing mechanics and tuning progression before finalizing the public demo.

## Agreed gameplay changes

- Attach to walls only while falling, never during the upward part of a jump. Require hand/torso contact backed by connected wall structure so foot-level ground bumps and isolated terrain cells do not catch the character. Dug faces need not be flat: held grips follow shallow recesses and protrusions using collision-checked horizontal adjustments. Preserve unlimited climbing, air steering, detachment, wall jumping, and protection against immediate reattachment, including getting over the top of a wall.
- Grounded walking automatically steps up and follows down small terrain changes. Two cells (8 world pixels on the current grid) is the selected limit; remove the one-cell developer comparison and normalize older one-cell saves to two cells. Check clearance throughout the step and require supporting ground at the destination. Keep walking grounded on small descents; jumping, airborne movement, larger cliffs, and wall climbing retain their normal physics.
- Disable digging while attached to a wall initially. A purchased upgrade enables it.
- Replace continuous excavation with discrete pickaxe strikes. Holding the dig input repeats swings; each impact applies terrain damage, with time between impacts.
- Give terrain durability so harder material can require several strikes. Keep partial damage when leaving an area or saving. Render four stages based on the fraction of material HP lost, progressing through bruising and branching cracks to chipped, nearly broken faces. Clip marks to their solid cell and draw them before scene lighting; appearance must not change collision, damage, or water.
- Use five natural materials: sparse surface sand at 1 HP, earth at 3 HP, stone at 6 HP, basalt at 10 HP, and granite at 16 HP. Sand stays within sixteen metres of the local surface; wavy, overlapping harder deposits become more common deeper down without forming uninterrupted upgrade gates. Reinforced infrastructure and the sealed map boundary remain indestructible.
- New expeditions use a 384 by 2053 grid of four-pixel cells, reaching 2000 metres of standing-player HUD depth. Continue reservoir placement throughout the expanded depth. Keep older saved worlds at their original dimensions; the deeper site requires a new expedition.
- Add seven jump-power purchases, seven climbing-speed purchases, and one double-jump purchase. More jump power increases upward launch speed and height. Ground and wall contact replenish the single air jump; repeated airborne inputs cannot grant additional jumps. Balance wall jump → air jump → reattach ascent against climbing assist of the same tier, including optimized jump timing and either wall side.
- Use mouse position to choose digging direction rather than strike distance. The strike centre has a fixed distance from the character for a given digging radius, and that distance scales with radius. Tune the geometry against adjacent walls, floors, and narrow tunnels.
- Add terrain variety, smaller water pockets, and a slower, visible transfer of water into the hopper.
- Detached earth or sand islands of one to three cells fall and disappear on landing, clearing small floating obstacles. Shared-edge contact with other solid terrain anchors a loose group. Larger islands and harder materials do not collapse. Falling fragments are nonblocking and do not displace water.
- Keep water accounted for across terrain, the tank, and the machine. Credit only the amount actually transferred, including interrupted transfers.
- Large water releases fall together and drain down excavated slopes without turning into a stalled block or a long dilute trail. Once a column reaches supported liquid, it can spread into the receiving basin at every height. Water may pass around a rock corner only through an open side and an open lower neighbour. Falling streams render continuously; resting pools retain their actual fill height. Tiny numerical residue stays accounted for rather than being deleted.
- Put the exchange on a small reinforced platform at the left map boundary, supported by an indestructible foundation down to the map bottom. Its right face must remain climbable with initial equipment and meet the platform without an overhang. Keep the diggable map connected to its right. New expeditions use this placement; older saved worlds retain their actual terrain and machine.
- Separate the starter shaft from the platform with a flat walkable surface. Place its left lip 480 world pixels beyond the platform edge, about two-thirds of a standard 1280-pixel window at zoom 1.8. Use a fixed world distance so resizing never changes seeded generation. Move the starter pocket and its earth collar with the shaft, preserve initial tool reach and both climbable faces, and keep neighbouring reservoirs sealed. Existing saves retain their original entrance.
- Each pocket independently starts dry with probability 1/5, including the starter and both legacy layouts. Dryness uses a separate seeded draw from size, volume, and placement. Keep cavity geometry identical whether wet or dry, and keep the water detector truthful. Remove the three separate pre-carved hollow caves; broader hollow-cave design belongs after the demo.

## Water pockets and vision

Every new expedition uses the three-size depth-weighted distribution and normal dark-cave vision. New Game exposes no water-layout or full-visibility choices. Keep the earlier many-small and fewer-large layouts internally for deterministic tests and save compatibility, preserving existing saved worlds and their layout metadata.

Dark caves with temporary sonar outlines are the selected vision mode. A small light around the character and a mouse-aimed headlamp illuminate the immediate working area. Outside illumination and active echoes, all cave outlines stay dark, including previously explored ones. Solid terrain conceals water. Cave sonar is a navigation tool: its wave expands as a circle in open space, follows tunnels around bends, and briefly traces adjacent wall outlines. Travel uses any-angle paths rather than horizontal/vertical grid-step distance. Terrain blocks propagation, including diagonal corner gaps. Sealed cavities and water pockets remain hidden. It works on the current cave geometry without permanently exploring or illuminating it.

Retain the original penetrating radial scan as the **Subsurface scanner**, a separate reserved item. Its pulse can trace sealed cavities, including water-pocket outlines, through terrain. Hide it from the shop and reject purchases until its design is finalized; no player keybinding is assigned. Save its pulse/cooldown separately from Cave sonar. Existing Cave sonar ownership carries over to the new navigation mechanic, and older saves receive an unowned, inactive scanner.

The headlamp comparison is also resolved: the lamp follows mouse aim and the visible head rotates with that aim. Remove both vision comparison selectors. Continue/load preserves the pocket distribution; older saves adopt dark caves and mouse-aimed lamps while retaining their world, exploration data, equipment, and progress. Keep full visibility only in the gated developer panel for testing.

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

Normalize those weights before sampling each pocket independently. Depth uses the HUD's metres: pocket centre row minus the starter surface row (44), rather than world pixels. The expanded finite map has 198 pockets including the starter, with at least 5940 units of cavity capacity before dry rolls. Actual water varies by seed and independently sampled dryness; do not condition draws on a water budget or force a size or wet quota into each depth band, which would change the requested odds.

| Depth | Small chance | Medium chance | Large chance |
| --- | --- | --- | --- |
| 0 | 70.6% | 22.3% | 7.1% |
| 50 | 69.2% | 23.1% | 7.7% |
| 200 | 64.8% | 25.3% | 9.9% |
| 1000 | 36.6% | 33.2% | 30.1% |
| 2000 | 9.6% | 25.1% | 65.3% |

The curve shifts from mostly small pockets near the surface to mostly large pockets toward 2000 metres. All sizes remain possible at every depth; a particular seed need not contain all three shallow sizes. Keep the starter route and nearby second pocket accessible, and preserve sealed separation from other pockets and boundaries. These initial volumes remain tunable.

Shallow water supply now varies with both class draws and volume variation. Tune pocket density and upgrade pacing after playtesting rather than altering the requested class probabilities to enforce a budget.

### Legacy depth-band comparisons

The two earlier layouts remain internal test fixtures and save-compatible layouts, with their original shallow volume variation and identical cavity-capacity budget at each depth band, plus additional bands throughout the expanded site. Independent dry rolls reduce actual water below these capacities. Their original shallow supply budget is retained for compatibility; water delivery no longer defines the ending. They are not selectable in New Game.

| Depth band | Many small: pocket count | Fewer large: pocket count | Capacity in either preset |
| --- | --- | --- | --- |
| Shallow, including the shared 45-unit starter | 8 | 4 | 240 |
| Middle | 10 | 5 | 600 |
| Deep | 10 | 7 | 1,100 |
| Additional 17 deeper bands | 170 | 119 | 18,700 |
| Total | 198 | 135 | 20,640 |

The original three bands occupy pocket centre rows below 120, 120–184, and 185–255. Additional bands place pockets around depths 300, 400, and onward through 1900 metres, each with 1100 units of cavity capacity before dry rolls. Seeded variation changes individual volumes and positions while preserving each band's capacity budget. The next shallow pocket is near the starter in both presets. Layout changes apply to new expeditions; loading an earlier save keeps its existing pockets and dimensions.

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

Use sky visibility and attenuated light spreading through connected open space as the initial model. Terrain blocks ordinary light, while headlamps and surrounding work light keep the immediate working area readable. Recompute affected lighting as excavation changes the terrain.

Keep illumination and exploration history distinct. Give the current working area soft, workable local visibility; distant unlit outlines require sonar. Lighting must not expose water through solid rock.

Give the worker a small terrain-only halo so nearby partial mining damage remains readable inside rock. Measure it outward from the player's body rectangle, starting at four cells rather than from the character's centre. It reveals only solid terrain and its damage without a line-of-sight check, with a soft warm fade toward the outer edge. Water, air, and sealed cave interiors retain normal terrain-blocked visibility. The halo grants no permanent visibility and disappears from terrain when the worker moves away. Its reach multiplies by 1.2 with each existing torso-lamp purchase: 4/4.8/5.76 cells, or 16/19.2/23.04 world pixels on the four-pixel grid. Headlamp upgrades do not affect it; ordinary lamp occlusion and sonar propagation stay unchanged.

Unlit environment is opaque darkness: cave space, rock, water, and their physical edges must not reveal the cave silhouette. Scan echoes add temporary outlines as the ping passes. Light reveals and tints the actual environment, with pale white moon/sky light and warm yellow headlamp/torso light. Adding a light must never darken an already illuminated area. Narrow shafts attenuate sky light with depth; light updates when excavation changes sky exposure.

Player lamps become subdued where ambient light is stronger, restoring their strength as the surroundings darken. Evaluate this at each illuminated surface, so a headlamp aimed from daylight into a dark tunnel still works. The blend must not create a dark dip on the way toward the surface.

Starting headlamp depth is 126 world pixels, reduced by 30% from 180. Its full cone angle is 64.8 degrees, reduced by 10% from 72; the half-angle is 32.4 degrees. Torso illumination keeps its 55-pixel starting radius. Each property has two independent purchases that multiply the previous value by 1.2, giving a restrained 44% increase at level two. These purchases change beam geometry, preserving warm tint, ordinary lamp occlusion, and ambient suppression; torso purchases also extend the terrain-only halo.

## Demo ending

Reach the bottom of the 2000-metre site to finish the demo. Measure depth from the player's top using the same unrounded value as the HUD. Delivery totals no longer trigger completion or cap hopper transfers, so players can keep collecting, selling, and upgrading before their final descent. Buying every upgrade is optional.

Active historical saves adopt depth completion while retaining their actual map dimensions, terrain, equipment, water, and credits. An older shallow map ends at its own reachable bottom instead of an impossible 2000-metre depth; a new expedition is required for the deeper site. Already completed historical 400/600-water saves remain frozen endings. The v0.1.28 update leaves prices, reveal order, equipment effects, and water generation unchanged. See [the economy review](ECONOMY_REVIEW.md) for purchase and supply arithmetic and the remaining starting-equipment playtests.

On reaching the bottom, congratulate the player on beating the demo and end gameplay without transferring or deleting water. Offer an optional one-to-five-star rating and suggestions text box. Do not continue the simulation behind the end screen. A completed save must restore the ended state. The ending also offers bug reporting, a new expedition, the main menu, and desktop Quit. An optional Steam wishlist link appears only after a real store URL is configured.

## Provisional upgrades

The following selection is approved for the provisional build and remains subject to tuning before the public demo is finalized.

| Upgrade | Form |
| --- | --- |
| Digging radius | Seven purchases beyond base |
| Digging damage | Three purchases beyond base |
| Digging speed | Three purchases beyond base; reduces swing interval and proportionally scales wind-up |
| Jump power | Seven purchases beyond base; faster upward launch and higher jumps |
| Double jump | One purchase; one air jump, recharged by landing or a wall grip |
| Wall-climbing speed | Seven purchases beyond base |
| Water tank capacity | Nine purchases beyond base; 20 more water per level, up to 200 |
| Water detector radius | Repeatable levels; requires detector v1 |
| Torso-lamp radius | Two purchases beyond base; 20% more light radius and terrain-only halo reach per level |
| Headlamp width | Two purchases beyond base; 20% wider cone per level |
| Headlamp depth | Two purchases beyond base; 20% longer range per level |
| Water detector v1 | One purchase; points toward the closest water body within its radius, with no indicator when none is in range |
| Digging while attached to a wall | One purchase; disabled before purchase |
| Cave sonar | One purchase; temporarily traces connected tunnel walls for navigation |

Mining and traversal retain exaggerated maximum capabilities. Tank capacity has nine purchases; detector range retains its two-purchase bound. The shop must show the current stat, purchase effect, price, and affordability. The approved prices below remain unchanged in v0.1.28; their pacing remains provisional.

| Track | Base and successive values | Successive prices (cr) |
| --- | --- | --- |
| Radius (world pixels) | 12, 16, 20, 26, 34, 44, 58, 76 | 15, 20, 30, 45, 65, 90, 125 |
| Damage per impact | 1, 2, 3, 6 | 30, 55, 95 |
| Seconds between swings | 0.48, 0.34, 0.24, 0.16 | 30, 55, 95 |
| Ground/air jump launch (world pixels/second) | ~159, 350, 440, 540, 650, 780, 920, 1080 | 15, 20, 30, 45, 65, 90, 125 |
| Wall-climbing speed (world pixels/second) | 75, 135, 200, 280, 350, 440, 550, 680 | 15, 20, 30, 45, 65, 90, 125 |
| Water tank capacity | 20, 40, 60, 80, 100, 120, 140, 160, 180, 200 | 10, 15, 20, 25, 35, 45, 60, 80, 110 |
| Torso-lamp radius (world pixels) | 55, 66, 79.2 | 35, 70 |
| Headlamp full cone angle (degrees) | 64.8, 77.76, 93.312 | 35, 70 |
| Headlamp depth (world pixels) | 126, 151.2, 181.44 | 35, 70 |
| Water detector range | Two increases after detector purchase | 45, 90 |

| One-time equipment | Price (cr) |
| --- | ---: |
| Water detector | 60 |
| Work harness | 80 |
| Cave sonar | 90 |
| Double jump | 100 |

Wind-up is one quarter of the current swing interval. Across damage tiers 1/2/3/6, earth takes 3/2/1/1 impacts, stone 6/3/2/1, basalt 10/5/4/2, and granite 16/8/6/3. Sand always breaks in one impact. All mining purchases total 750 credits: 390 for radius and 180 each for damage and speed. Adding the first capacity upgrade and work harness brings that to 840. The depth ending allows continued earning for the complete mining showcase; starting-equipment playtests must still establish enjoyable purchase and return-trip pacing. Maximum upgrades must still respect terrain shielding, reinforced foundations, water accounting, and the requirement for a harness when digging on a wall. Existing radius/damage levels keep their stats and partial terrain damage; older saves without speed upgrades receive level zero.

Base climbing is 75 world pixels per second. Base ground launch is `275 × 75/130` (approximately 159), base wall launch is 120, and upward gravity is `900 × (75/130)²` (approximately 300). Scaling launch and upward gravity together slows the initial ascent while preserving roughly 42-pixel ground and 24-pixel wall jumps. Jump purchases use upward gravity 900. Falling retains gravity 900 and terminal speed 420 at every tier; the automatic wall-lip assist retains its 16-pixel height.

Each complete jump or climbing track costs 390 credits; double jump costs 100. Wall-origin jumps and their air jump use the lesser of the current jump launch speed and 1.6 times the climbing speed corresponding to that jump tier. This permits faster wall scaling than unupgraded climbing after investing in jump power, while keeping optimized repeated wall/air-jump ascent roughly equal to or below same-tier climbing assist. Climbing speed purchases do not change the wall-jump cap. Ground-origin jumps retain the full jump-power speed. All mining and mobility purchases total 1,630 credits; players choose how much equipment to buy before the final descent.

Hide unavailable upgrades, including unrevealed tracks, unmet prerequisites, and equipment with no remaining levels. Show eligible upgrades without enough funding with a red price such as "40 cr"; funded upgrades retain the install button. New expeditions reveal only mining radius. Every purchased visible equipment level reveals one more track, including repeat purchases within an existing track. Use this order:

| Order | Track |
| ---: | --- |
| 0 | Mining radius |
| 1 | Mining damage |
| 2 | Water detector |
| 3 | Climbing speed |
| 4 | Tank capacity |
| 5 | Jump power |
| 6 | Digging speed |
| 7 | Cave sonar |
| 8 | Work harness |
| 9 | Double jump |
| 10 | Headlamp depth |
| 11 | Torso lamp |
| 12 | Detector range |
| 13 | Headlamp width |

The revealed prefix contains one plus the total purchased visible equipment levels, capped to the prerequisite-eligible order. Skip detector range until the detector is owned; without a detector, headlamp width can therefore reveal after twelve purchases. Completed tracks keep their position in the order even though their shop rows disappear. Preserve access to previously owned tracks outside the prefix when loading older saves. Credits and delivered water do not count as purchases. The hidden Subsurface scanner is never revealed and its saved level does not contribute. Derive progression from existing saved equipment levels without adding save fields or changing the saved world or resource ledger.

The three lamp tracks follow the reveal order and have no equipment prerequisite. Each complete track costs 105 credits; all lamp purchases total 315. Older saves without these entries receive level zero without changing terrain, water, credits, or other equipment. Save purchased lamp levels and restore their illumination. Derive terrain-only halo reach from the restored torso level without adding a purchase or save field; development omni vision stays independent of lamp equipment.

Tank capacity has ten equipment levels in total, indexed 0–9, with capacity `20 * (L + 1)` at upgrade level L. The nine purchases cost 400 credits altogether, and the track first reveals after four purchased levels. Account for those earlier purchases when assessing a purchase route. Suction stays at 36 water per second at every level. Full-tank unloading time is `0.8 * (1 + L / 9)` seconds, and hopper transfer rate is capacity divided by that time. The 20-water starting tank empties in 0.8 seconds at 25 water per second; the 200-water maximum tank empties in 1.6 seconds at 125 water per second. Partial tanks empty proportionally to their contents at the same equipment-derived rate. Interrupted transfers credit only the delivered water. Crossing the old 400/600 totals neither stops transfers nor completes an active expedition; actual depth completion stops simulation and pending actions immediately.

Existing saved capacity levels 0/1/2 keep their original 20/40/60 capacities. Preserve all purchased equipment levels, actual tank water, credits, delivered totals, and terrain without price refunds or regeneration; derive the unloading rate from the restored capacity level without adding save fields. Backpack growth remains bounded at the previous 60-water model size so larger capacity does not obscure the worker or environment. All visible equipment totals 2,710 credits; the hidden Subsurface scanner remains unchanged.

### Other upgrade ideas retained for tuning

These proposals remain available for discussion without being added to the initial upgrade selection. Cave sonar is already included as a one-time navigation upgrade; its balance remains subject to tuning.

| Candidate | Original proposed behaviour |
| --- | --- |
| Water tank suction speed | Repeatable upgrade that increases water collection speed |
| Sonar cooldown | Repeatable upgrade that reduces cooldown; requires sonar |
| Water detector v2 | One-time purchase requiring v1; also indicates the water body's mass, with deeper colour for more water |
| Subsurface scanner | Reserved and hidden; preserves the original penetrating cavity-outline scan pending further design |

## Presentation and menus

- Follow [the art direction brief and generated reference](ART_DIRECTION.md): a weighty illustrated industrial cutaway, broad geological forms, subdued mineral colours, controlled teal water, a sturdy worker, and compact functional UI. Apply it to the character sprite, terrain, machine/hopper, other environmental assets, gameplay HUD, and purchase menu.
- Maintain material separation and substantial cut edges after arbitrary excavation, including awkward player-dug tunnels. Make water the visual centrepiece through readable volume, surfaces, and flow.
- Include visible pickaxe impacts, head rotation for the mouse-directed lamp, and visible equipment changes for major upgrades at gameplay scale.
- Use a distinct attached silhouette with hands gripping the wall and braced legs. Before the wall-dig upgrade the attached model has no wielded pickaxe; afterward it keeps one hand gripping and wields the pickaxe with the other.
- Keep the quiet original synthesized background music and SFX. Add compatible exploration and returning motifs that blend continuously with current tank fill, and lower/deeper layers blending across 0–1600 HUD metres. Use smooth transitions without song restarts at thresholds, retain phrase variation, and preserve independent music/SFX controls.
- Provide New Game, Save, Load, Continue, pause, and settings. Settings include resolution/window size, windowed/fullscreen mode, audio, and keybindings.
- Provisional builds include a backtick developer panel with omni vision, a set-credit-balance field, teleport to the actual saved hopper, and **Warp to demo end**. Teleport finds a clear nearby position, prefers floor support, resets motion and pending actions, and preserves terrain and resource ledgers. Allow a clear airborne destination for unsupported legacy hoppers; report failure when all nearby positions are blocked. Ending warp relocates the worker to the bottom and opens the survey without consuming water or granting credits, including on dry sites; reject repeated warps without mutation. Pause simulation while the panel is open and preserve valid saves. Gate the panel and all visibility overrides behind `VITE_DEV_TOOLS`; release builds remove them. These are testing tools, not public-demo features.
- F8, rebindable in Settings, captures the game canvas and opens a paused bug-report panel. Preview the screenshot and allow its removal; do not accept custom image uploads. Keep local drafts and exports available. The separate, bounded HTTPS receiver has passed real human-verified report and survey checks, and v0.1.25 configures its public origin. Cloudflare edge rate limiting has passed on both submission paths. On 2026-10-16, the developer's packaged game delivered text and in-expedition screenshot reports and a five-star survey with real server-validated human checks. The developer confirmed cancellation, draft preservation, retry, and visible success, completing feedback checks for the tested package. Broader native lifecycle and public release checks remain; see [feedback deployment](FEEDBACK.md).

Provisional production bounds are five natural terrain materials with different durability plus reinforced infrastructure, one original adaptive synthesized score, a small core sound set, and one local save slot with autosaving. Version 2 uses lossless compact grids for the deeper site. Save data includes changed terrain and damage, water, inventory, credits, upgrades, exploration, comparison modes, depth or historical delivery completion state, and consumed air-jump/wall-chain state. Continue reading version 1 without resizing or regenerating its world. Missing jump equipment starts unpurchased; loading an older airborne save must not grant a fresh air jump.

## Supporting work proposed for the demo

- Use a finite procedural site with reproducible seeds, a safe spawn, an accessible machine, and enough reachable water to support progression toward the bottom. The starting route must work before the wall-dig upgrade is purchased.
- Add contextual control and interaction guidance. Check movement, digging geometry, visibility, water behaviour, and pacing across several generated sites.
- Package Windows and macOS builds that run without a development environment, and test installation, saving, controls, audio, and display settings in those builds.
- Prepare the Steam store and linked demo application, release assets, build configuration, installation testing, and review/release work.

Artifact placement, artifact signals, and artifact recovery are excluded from the demo. Additional traversal systems, liquids, biomes, survival mechanics, achievements, and cloud saving remain later work.

## Validation

Continue test-driven development: write a meaningful failing behaviour test, confirm the expected failure, implement the smallest change, then refactor with tests passing. Keep simulation and progression independent of rendering and Electron.

Test grounded stepping in both directions, ascent/descent caps, headroom, swept-path collisions, and jumping/airborne exclusions alongside falling-only attachment, detachment suppression, the wall-dig purchase restriction, strike timing and damage, fixed digging distance, upgrades, detector behaviour, water conservation during transfer, save/load, comparison-mode restoration, and depth completion. Check just-above and exact-bottom depth boundaries, uncapped delivery across historical 400/600 totals, frozen completion without resource mutations, active legacy-world migration, and completed historical saves. Test generated sites deterministically across seeds and all three distributions: initial tool reach when the starter is wet, separated cavities, depth-based volume variation, comparable legacy capacity budgets, independent 20% dry rolls including the starter, and sufficient actual water across sampled sites. Verify reinforced support cannot be removed or damaged, blocks strikes, survives save/load, and remains climbable along its full exposed face. Test sonar around bends, sealed pockets, both faces of thin walls, diagonal gaps, excavation changes, timing/fade and cooldown. Verify the retained scanner penetrates independently while its purchase stays hidden. Preserve legacy saved worlds and equipment when adding new options or items.

Test the formula's adjacent ratios, normalized probabilities, sampling thresholds, and aggregate generated-pocket frequencies. Verify independent volume variation, inclusive class bounds, varying starter volumes with reliable initial reach, separation of maximum 240-unit pockets, and water conservation after liquid stepping. Verify New Game always starts the three-size layout with normal vision, while loading legacy layouts preserves their saved worlds and metadata. Check that explored unlit caves stay dark before and after sonar fades, including when loading an older remembered-outline save. Check mouse-aimed lighting and visible head rotation, digging feel, readable darkness, discovery, movement, sound, menus, keybindings, and progression manually. Before finishing implementation changes, run `npm test` and `npm run build`, and playtest control/rendering changes in the browser or Electron.

Verify all 7/3/3 mining purchases, capped prices, the 750-credit mining total, discrete upgraded swing timing and animation, distinct material hit counts, maximum-radius terrain shielding, and foundation/water preservation. Check relative-health damage stages, clipping to the damaged cell, concealment in darkness, and unchanged collision/water during rendering. Verify seven jump and climbing purchases, increasing actual jump height/launch speed, one air jump per ground/wall recharge, preserved base jump/lip heights with slower initial ascent, unchanged falling gravity, and optimized repeated wall/air-jump ascent no faster than matched-tier climbing on either side. Round-trip maximum equipment, spent jumps and partial damage in every natural material; migrate absent speed/jump metadata and one-cell saves. Verify compact-grid validation, lossless round trips, retained shallow version 1 dimensions, 2000-metre standing depth, deeper resource placement, sparse shallow sand, and bounded render buffers at the bottom. Test teleport support/clearance, legacy hopper placement, blocked/completed rejection, jump/action resets, unchanged resource ledgers, autosaving, and removal from release bundles. Test smooth continuous audio scene weights across the extended depth, phrase variation, independent gain controls, silent startup, interrupted fades, skipped overdue beats, and node cleanup; playtest live tank/depth changes and music mute/pause.

Verify two purchases for each lamp track, 20% compounding geometry changes, capped levels/prices, affordability, and independent equipment effects. Round-trip lamp levels and migrate missing entries to zero while retaining the saved world and economy. Check the terrain-only halo's four-cell base distance from every side of the body rectangle, soft edge fade, 20% torso scaling, and restored equipment reach. Verify it reveals nearby solid terrain and damage but leaves water and sealed cave interiors hidden, hides terrain again when moving away, and does not change terrain, collision, damage, or resource ledgers. Playtest the smaller starter beam and each upgraded lamp in darkness, through excavated passages, and near surface light; check that terrain still blocks ordinary illumination and omni vision does not change equipment.

Verify all nine capacity purchases, 20-water increments through 200, capped levels/prices, and the 400-credit track total. Check unchanged suction at every level and monotonically increasing full-unload duration from 0.8 to 1.6 seconds, with exact actual-water crediting across partial and interrupted transfers beyond the old delivery totals. Round-trip maximum capacity and preserve legacy 20/40/60 tanks, water, and credits. Playtest shop descriptions, larger tank HUD values, accelerated hopper transfer, and bounded backpack visuals.

Verify the exact reveal order, one initial track, repeat-level counting, immediate shop refresh after purchases, locked direct-purchase rejection, and maxed-track positions. Check detector-range skipping and later prerequisite satisfaction, hidden-scanner exclusion, and preserved access to older owned tracks. Round-trip reveal state through existing equipment fields without extra save metadata or resource changes. The economy audit must honor these gates, identify blocked fixed plans, and label mixed progression examples separately.

## Provisional build tuning

New expeditions end at 2000 HUD metres; active older shallow saves end at their preserved bottom. Completed historical delivery runs remain ended. Initial pickaxe swings take 0.48 seconds with a 0.12-second wind-up. Tank collection stays at 36 water units per second; hopper transfer scales from 25 to 125 water units per second across capacity levels, so full-tank unloading takes 0.8 to 1.6 seconds. Speed purchases reduce both swing interval and wind-up, ending at 0.16/0.04 seconds. Sand/earth/stone/basalt/granite durability is 1/3/6/10/16. Starting climbing speed is 75 world pixels per second, rising to 680; ground jump launch rises from approximately 159 to 1080. The base tier uses approximately 300 upward gravity to preserve its earlier jump height at the slower launch speed; upgraded jumps and all falling use gravity 900. All are starting values for playtesting.

Tune the core timings and depth ending in `src/game/session.ts`, three-size volumes/probabilities in `src/game/water-pockets.ts`, reservoir placement and legacy budgets in `src/game/generation.ts`, upgrade effects/prices in `src/game/economy.ts`, material durability/reach in `src/game/digging.ts`, wall grip/contour tolerance and walking-step height in `src/game/player.ts`, and lighting/sonar in `src/game/vision.ts`. Held grips currently bridge up to 8 world pixels; walking steps use two terrain cells; ambient lamp suppression is 0.85. Music phrases, scene weights, and blend time live in `src/music.ts`, with audio scheduling and gain ramps in `src/audio.ts`. New Game uses fixed three-size generation and normal vision; builds with developer tools enabled expose full visibility, teleport, and credit controls in the backtick panel. `npm run build:release` and the `package:*:release` commands use `.env.release` to disable those tools. Partial-damage stages live in `src/terrain-damage.ts`, with their visual marks in `src/render.ts`. The current presentation and original synthesized audio are a first pass toward the art brief.

Windows x64 and macOS arm64/x64 release archives for v0.1.28 are built and structurally inspected. Native platform QA, final balance and presentation review, and the [Steam release preparation](STEAM_DEMO_RELEASE.md) remain before the public demo release. See [package evidence](DEMO_RELEASE.md#v0128-release-archives).
