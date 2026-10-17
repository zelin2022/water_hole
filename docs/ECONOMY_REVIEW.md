# Demo economy review

The v0.1.27 progression pass implements the approved reveal order while retaining the v0.1.26 upgrade prices and the **600-water delivery cutoff for new expeditions**. Water generation and equipment effects are unchanged. Existing saves retain their stored limit; saves without one keep their original 400-water ending, whether active or already completed. Purchased levels, actual water, and credits remain intact without refunds. Final economy tuning remains pre-release work; purchase and supply arithmetic does not establish a playtime target.

Start with mining radius revealed. Every purchased visible equipment level reveals another track in this order: radius → damage → water detector → climbing speed → tank capacity → jump power → digging speed → cave sonar → work harness → double jump → headlamp depth → torso lamp → detector range → headlamp width. Repeat levels in the same track count. Skip detector range in the reveal prefix until the detector is owned; completed tracks keep their ordering position. Older owned tracks remain upgradeable outside the prefix. The hidden scanner is excluded. Reveal state comes from existing equipment fields, with no new save metadata.

## Reproduce the audit

```sh
node scripts/economy-audit.mjs --seeds 64
```

The script loads the current game modules through Vite. It models hopper-only purchases, full tank returns, the actual credit, availability, and purchase functions, and the final delivery wall. Fixed plans retain their exact purchase sequence and report the first unavailable track, its required purchase count, and the count reached; they do not silently buy other equipment to unlock it. A separately named priority example chooses only affordable, revealed target tracks. The script also generates 64 deterministic sites whose seeds are dispersed across the uint32 range. Adjacent tiny seeds are a poor starter-dryness sample because the generator's first linear-congruential draws are correlated. No generation draws or probabilities are changed.

The default output contains compact purchase and supply tables. Full ledgers and per-seed data are saved to the gitignored `benchmark-results/economy.json`, including package version, UTC creation time, seed count, and seed rule. Add `--json` to also print that complete JSON on stdout. Run with the default 64 seeds to reproduce the supply figures below; smaller sample counts are useful for a quick command check but produce different aggregates.

The reveal-aware audit reproduced the unchanged 64-seed supply figures below. It is deliberately independent of rendering and hardware-load benchmarks.

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

Mining totals **750 credits**; adding the first tank purchase and work harness brings it to **840**. Mining, both mobility tracks, and double jump total 1,630. The hidden Subsurface scanner is unchanged and excluded from the visible total. These prices replace the v0.1.25 pass's 1,340-credit visible total and 285-credit mining total.

The following v0.1.27 results assume complete collection, no spills left behind, full returns except the final capped transfer, and buying each planned upgrade as soon as hopper funds and reveal rules allow it. Mining plans buy all radius levels, then damage, then speed. The end screen prevents purchasing at or after the cutoff. All fixed plans begin with unupgraded equipment; their hopper-return counts continue to the cutoff even when a purchase plan is blocked.

| Fixed purchase plan at 600 cutoff | Hopper returns | Purchases completed | Constraint |
| --- | ---: | ---: | --- |
| Tank only | 30 | 0/9 | Tank needs four prior purchases; plan has zero |
| Mining only, starting tank | 30 | 10/13 | Delivery cutoff before speed purchases |
| One tank purchase, then complete mining | 30 | 0/14 | Tank needs four prior purchases; plan has zero |
| Complete climbing plus double jump | 30 | 0/8 | Climbing needs three prior purchases; plan has zero |
| Complete tank, then complete mining | 30 | 0/22 | Tank needs four prior purchases; plan has zero |

The locked fixed plans remain blocked at every comparison cutoff: collecting more credits cannot reveal a track without a purchase. At cutoffs of 400/600/800 they make 20/30/40 full or final capped returns with the starting tank. The strict mining plan completes 6/10/13 purchases at those limits; it completes at 760 delivered in the 800 comparison, leaving 40 water before that comparison's ending. The 800 limit is arithmetic exploration, not a supported saved-run limit. The earlier v0.1.26 tank-only and climbing-only completion figures used the previous availability rules and do not describe new expeditions under this progression.

The separate **tank-priority mining** example targets all nine tank levels and all thirteen mining levels. At each hopper visit it chooses the first affordable, currently revealed track in the priority order tank → radius → damage → speed, repeating until no target purchase is possible. It begins with three radius purchases and one damage purchase to reveal the tank, then favors capacity while allowing affordable mining purchases. This is an illustrative purchase policy, not an optimal route or a replacement for any fixed plan above.

| Cutoff | Hopper returns | Purchases completed | Credits spent | Result |
| ---: | ---: | ---: | ---: | --- |
| 400 | 9 | 11/22 | 275 | Incomplete at the delivery wall |
| 600 | 10 | 13/22 | 415 | Incomplete at the delivery wall |
| 800 | 11 | 15/22 | 570 | Incomplete at the comparison wall |

At 600, that example owns eight tank levels, three radius levels, one damage level, and one speed level. Its last return reaches the ending with 185 unspent credits, so it cannot make another purchase even though it can afford the final tank level. This demonstrates why both the reveal order and hopper timing belong in the audit.

These counts exclude the time spent finding water, digging, climbing, and making purchasing decisions. They must not be presented as expected playtime.

The complete mining set now costs more than the unchanged 600-water cutoff, even before travel equipment. The earlier goal of showcasing all three completed mining tracks needs a later balance decision; the price approval does not establish that goal as achievable or the economy as balanced. The initial v0.1.25 audit supported a longer post-upgrade window under its older prices; that conclusion does not carry over to this price pass.

## Seeded supply

With the existing three-size distribution and independent 20% dry rolls, the 64-site sample has:

| Metric | Minimum | Median | Maximum |
| --- | ---: | ---: | ---: |
| Total starting water | 14,269 | 15,725 | 17,750 |
| Water in pockets centred within 76 HUD metres | 123 | 428 | 699 |
| Shallowest depth containing 400 cumulative water across the map width | 32 m | 60 m | 123 m |
| Shallowest depth containing 600 cumulative water across the map width | 58 m | 91 m | 128 m |
| Shallowest depth containing 800 cumulative water across the map width | 87 m | 125.5 m | 187 m |

Thirty-seven of the 64 sites contain at least 400 water in that shallow area; only two contain 600 there. None contain 800 there. These are supply bounds that sum all pockets across the map width, not reachable routes or predictions of how far a player will actually descend. They show that neither the legacy cutoff nor the current one requires approaching the map's 2,000-metre bottom.

Eleven sampled starters are dry. Reproducible dry-start examples include seeds **3041712678**, **2802362286**, and **3816266512**. Include a dry start in local readiness checks. Preserve the independent dry roll rather than imposing a wet quota or silently rerolling the initial pocket. An initially dry pocket especially needs controls and feedback that explain the empty discovery without assuming the player already owns a detector.

## Limits and follow-up

This analysis does not measure enjoyment, difficulty, actual return time, or whether the controls teach themselves. It assumes players can discover and collect the generated water. Before release, complete normal playthroughs with the implemented reveal order and without developer credits, including wet and dry starts. Assess early purchase pacing, collection and return trips, meaningful equipment tradeoffs, and the revised mining showcase goal. Tune prices, upgrade effects, or the delivery cutoff as needed and rerun the audit when those rules change. This remains separate from the arithmetic audit.

The release should remain a bounded demo with a thank-you ending; artifact searching and additional cave systems remain full-version work. Reports from the released demo can inform further small balance patches after this initial tuning pass.
