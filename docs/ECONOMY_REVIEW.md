# Demo economy review

The v0.1.28 demo ends on reaching the **2000-metre bottom**, replacing the cumulative-water delivery wall. Players can keep selling and upgrading before their final descent; no upgrade is required for completion. Approved prices, reveal order, equipment effects, and water generation are unchanged. Active historical saves adopt the depth ending at their preserved map bottom, while already completed 400/600-water runs remain completed. Actual water, credits, equipment, and terrain remain intact without refunds or regeneration.

The developer's fully upgraded descent was manageable. That does not establish the pacing from starting equipment. Final economy tuning remains pre-release work: normal runs must assess discovery, purchase choices, and repeated return trips before the final descent.

Start with mining radius revealed. Every purchased visible equipment level reveals another track in this order: radius → damage → water detector → climbing speed → tank capacity → jump power → digging speed → cave sonar → work harness → double jump → headlamp depth → torso lamp → detector range → headlamp width. Repeat levels in the same track count. Skip detector range in the reveal prefix until the detector is owned; completed tracks keep their ordering position. Older owned tracks remain upgradeable outside the prefix. The hidden scanner is excluded. Reveal state comes from existing equipment fields, with no separate progression metadata.

## Reproduce the audit

```sh
node scripts/economy-audit.mjs --seeds 64
```

The script loads the current game modules through Vite. It models hopper-only purchases, full tank returns, and the actual credit, availability, and purchase functions. It reports **depth 2000** as the ending. The 400/600/800-water tables are explicitly delivered-water accounting budgets, not candidate endings: purchases are allowed after the final budgeted transfer. Unlimited-budget plans stop when their purchases complete or their fixed sequence encounters an unrevealed track. Fixed plans never silently buy substitutes to unlock equipment; a separately named priority policy chooses only affordable, revealed target tracks.

The script also generates 64 deterministic sites whose seeds are dispersed across the uint32 range. Adjacent tiny seeds are a poor starter-dryness sample because the generator's first linear-congruential draws are correlated. No generation draws or probabilities are changed.

Default output contains compact purchase and supply tables. Full ledgers and per-seed data are saved to the gitignored `benchmark-results/economy.json`, including package version, UTC creation time, seed count, and seed rule. Add `--json` to print the complete JSON on stdout. Run the default 64 seeds to reproduce the supply figures below; smaller samples produce different aggregates.

This audit models purchase arithmetic and starting supply. It does not simulate discovering water, excavating a route, climbing to the hopper, or reaching the bottom. Its return counts are not playtime predictions.

## Purchase opportunity

All visible equipment costs **2,710 credits** together. One delivered water grants one credit.

| Equipment | Successive prices (cr) | Complete cost (cr) |
| --- | --- | ---: |
| Mining radius | 15/20/30/45/65/90/125 | 390 |
| Mining damage | 30/55/95 | 180 |
| Mining speed | 30/55/95 | 180 |
| Jump power | 15/20/30/45/65/90/125 | 390 |
| Climbing assist | 15/20/30/45/65/90/125 | 390 |
| Tank capacity | 10/15/20/25/35/45/60/80/110 | 400 |
| Torso-lamp radius | 35/70 | 105 |
| Headlamp width | 35/70 | 105 |
| Headlamp depth | 35/70 | 105 |
| Water detector | 60 | 60 |
| Detector range | 45/90 | 135 |
| Work harness | 80 | 80 |
| Cave sonar | 90 | 90 |
| Double jump | 100 | 100 |

Mining totals **750 credits**; adding the first tank purchase and work harness brings it to **840**. Mining, both mobility tracks, and double jump total **1,630**. The hidden Subsurface scanner is unchanged and excluded from the visible total.

The following v0.1.28 results use perfect collection and full returns, buying as soon as hopper funds and reveal rules allow. An unlimited accounting budget removes the old delivery wall; it does not assume an infinite map or infinite water. Supply is checked separately below.

| Purchase policy | Purchases completed | Hopper returns to completion | Delivered at final purchase | Credits spent |
| --- | ---: | ---: | ---: | ---: |
| Strict mining: all radius, then damage, then speed | 13/13 | 38 | 760 | 750 |
| Tank-priority mining: first affordable revealed track among tank, radius, damage, speed | 22/22 | 13 | 1,200 | 1,150 |
| All visible equipment: complete each track in reveal order | 48/48 | 63 | 2,840 | 2,710 |

The all-equipment sequence is valid under the real reveal guards, including the detector prerequisite, but its many starting-tank returns make it an illustrative accounting policy rather than a recommended play strategy. The tank-priority policy first buys three radius levels and one damage level to reveal capacity, then favours capacity while making affordable mining purchases. Neither policy is claimed to minimize travel, returns, or playtime.

Strict tank-only, tank-first/mining, and climbing-first plans remain blocked from an unupgraded start, regardless of available credits. Capacity needs four prior purchased levels and climbing needs three. The audit reports those constraints without pretending the plans have already unlocked their targets.

| Delivered-water budget, not an ending | Strict mining purchases | Tank-priority mining purchases | Tank-priority credits spent |
| ---: | ---: | ---: | ---: |
| 400 | 7/13 | 13/22 | 380 |
| 600 | 11/13 | 15/22 | 570 |
| 800 | 13/13 | 18/22 | 780 |

These budgets cap the amount made available to the accounting model, with a partial final return if needed. They do not freeze gameplay or prohibit spending after the last transfer. The former 600-water ending prevented completing the 750-credit mining set; the depth ending removes that restriction. It does not, by itself, establish that the journey or economy is balanced.

## Seeded supply

The unchanged three-size distribution and independent 20% dry rolls produce the following 64-site sample:

| Metric | Minimum | Median | Maximum |
| --- | ---: | ---: | ---: |
| Total starting water | 14,269 | 15,725 | 17,750 |
| Water in pockets centred within 76 HUD metres | 123 | 428 | 699 |
| Shallowest depth containing 400 cumulative water across the map width | 32 m | 60 m | 123 m |
| Shallowest depth containing 600 cumulative water across the map width | 58 m | 91 m | 128 m |
| Shallowest depth containing 800 cumulative water across the map width | 87 m | 125.5 m | 187 m |
| Shallowest depth containing the 2,710-credit equipment cost across the map width | 310 m | 415 m | 588 m |

All 64 sampled maps contain more total water than the complete visible equipment cost. The depth figures sum every pocket across the map width: they are supply bounds, not reachable routes or predictions of when a player will afford equipment. Discovery, excavation, tank size, return distance, missed pockets, and player choices still determine actual progress. Players can also descend without maximizing equipment.

Thirty-seven sampled sites contain at least 400 water within 76 metres; only two contain 600 there, and none contain 800. Eleven sampled starters are dry. Reproducible dry-start examples include seeds **3041712678**, **2802362286**, and **3816266512**. Include a dry start in local readiness checks. Preserve independent dry rolls rather than imposing a wet quota or rerolling the initial pocket. An initially dry pocket needs controls and feedback that explain the empty discovery without assuming detector ownership.

## Limits and follow-up

Before release, play normal expeditions from starting equipment without developer credits, including wet and dry starts. Check the first few purchases, when capacity and mobility become useful, how many hopper returns feel worthwhile, whether players can find their way back, and whether the transition into the final descent feels earned. Check both an equipment-focused run and a more direct descent; full upgrades are optional.

Tune prices or equipment effects if those runs expose slow or trivial stretches, then rerun the audit when rules change. The depth ending preserves a bounded demo with a congratulations screen and optional survey. Artifact searching and additional cave systems remain full-version work. Feedback from the released demo can inform later small balance patches.
