# Demo economy review

The v0.1.26 balance pass applies the approved upgrade prices and retains the **600-water delivery cutoff for new expeditions**. Water generation and equipment effects are unchanged. Existing saves retain their stored limit; saves without one keep their original 400-water ending, whether active or already completed. Repricing preserves purchased levels, actual water, and credits without refunds. Final progression and economy tuning remain pre-release work; purchase and supply arithmetic does not establish a playtime target.

The approved next progression rule starts with one visible upgrade track and reveals another track after each purchased level. Its exact mapping and implementation remain pending, so this price update keeps the current availability rules. The audit below therefore models those current rules.

## Reproduce the audit

```sh
node scripts/economy-audit.mjs --seeds 64
```

The script loads the current game modules through Vite. It models hopper-only purchases, full tank returns, the actual credit and purchase functions, and the final delivery wall. It also generates 64 deterministic sites whose seeds are dispersed across the uint32 range. Adjacent tiny seeds are a poor starter-dryness sample because the generator's first linear-congruential draws are correlated. No generation draws or probabilities are changed.

The default output contains compact purchase and supply tables. Full ledgers and per-seed data are saved to the gitignored `benchmark-results/economy.json`, including package version, UTC creation time, seed count, and seed rule. Add `--json` to also print that complete JSON on stdout. Run with the default 64 seeds to reproduce the supply figures below; smaller sample counts are useful for a quick command check but produce different aggregates.

The v0.1.26 audit reproduced the unchanged 64-seed supply figures below. It is deliberately independent of rendering and hardware-load benchmarks.

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

The following v0.1.26 results assume complete collection, no spills left behind, full returns except the final capped transfer, and buying each planned upgrade as soon as hopper funds allow it. Mining plans buy all radius levels, then damage, then speed. The end screen prevents purchasing at or after the cutoff. These plans use current availability and are unconstrained by the pending track-reveal mapping.

| Purchase plan at 600 cutoff | Hopper returns | Purchases completed | Complete plan after delivered water | Water remaining after complete plan |
| --- | ---: | ---: | ---: | ---: |
| Tank only | 6 | 9/9 | 420 | 180 |
| Mining only, starting tank | 30 | 10/13 | Cannot complete | — |
| One tank purchase, then complete mining | 16 | 11/14 | Cannot complete | — |
| Complete climbing plus double jump | 30 | 8/8 | 500 | 100 |
| Complete tank, then complete mining | 6 | 10/22 | Cannot complete | — |

For comparison, the tank-only plan needs five returns at a 400 cutoff and seven at 800; it is incomplete at 400 and completes at 420 with either higher limit. One tank purchase followed by mining needs 11/16/21 returns at 400/600/800 and completes only in the 800 comparison, at 780 delivered with 20 water remaining. Mining with the starting tank completes at 760 in the 800 comparison, leaving 40. Complete tank plus mining is incomplete at all three comparison limits. The 800 limit is arithmetic exploration, not a supported saved-run limit.

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

This analysis does not measure enjoyment, difficulty, actual return time, or whether the controls teach themselves. It assumes players can discover and collect the generated water. Before release, settle the approved track-reveal mapping and implement it, then rerun the purchase audit and complete normal playthroughs without developer credits, including wet and dry starts. Assess early purchase pacing, collection and return trips, meaningful equipment tradeoffs, and the revised mining showcase goal. Tune prices, upgrade effects, or the delivery cutoff as needed and confirm the final balance. This remains separate from the arithmetic audit.

The release should remain a bounded demo with a thank-you ending; artifact searching and additional cave systems remain full-version work. Reports from the released demo can inform further small balance patches after this initial tuning pass.
