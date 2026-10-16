# Demo economy review

The first release-candidate balance pass uses a **600-water delivery cutoff for new expeditions**, leaving upgrade prices and water generation unchanged. The numerical audit is complete; final upgrade economy tuning remains a pre-release task. This is a provisional setting based on purchase and supply arithmetic; it does not establish a playtime target. The previous 400 cutoff can end the run before a player has much opportunity to use a completed showcase track. Existing saves retain their original 400-water ending, whether active or already completed; the cutoff is now stored per expedition.

## Reproduce the audit

```sh
node scripts/economy-audit.mjs --seeds 64
```

The script loads the current game modules through Vite. It models hopper-only purchases, full tank returns, the actual credit and purchase functions, and the final delivery wall. It also generates 64 deterministic sites whose seeds are dispersed across the uint32 range. Adjacent tiny seeds are a poor starter-dryness sample because the generator's first linear-congruential draws are correlated. No generation draws or probabilities are changed.

The default output contains compact purchase and supply tables. Full ledgers and per-seed data are saved to the gitignored `benchmark-results/economy.json`, including package version, UTC creation time, seed count, and seed rule. Add `--json` to also print that complete JSON on stdout. Run with the default 64 seeds to reproduce the supply figures below; smaller sample counts are useful for a quick command check but produce different aggregates.

This audit took approximately two seconds on the development machine. It is deliberately independent of rendering and hardware-load benchmarks.

## Purchase opportunity

All visible equipment costs **1,340 credits** together. Mining costs 285, nine tank purchases cost 270, each seven-level mobility track costs 175, and double jump costs 35. Other equipment and lighting consume the remaining 400 credits. One delivered water grants one credit.

The following results assume complete collection, no spills left behind, full returns except the final capped transfer, and buying each planned upgrade as soon as hopper funds allow it. The end screen prevents purchasing after reaching the cutoff.

| Purchase plan | Bought completely after delivered water | Water remaining at 400 cutoff | Water remaining at 600 cutoff | Water remaining at 800 cutoff |
| --- | ---: | ---: | ---: | ---: |
| Tank only | 280 | 120 | 320 | 520 |
| Mining only, starting tank | 300 | 100 | 300 | 500 |
| One tank purchase, then complete mining | 300 | 100 | 300 | 500 |
| Complete climbing plus double jump | 220 | 180 | 380 | 580 |
| Complete tank, then complete mining | 680 | Cannot complete | Cannot complete | 120 |

Buying a larger tank early matters for return count. The one-tank-then-mining plan requires 11 hopper returns at 400, 16 at 600, or 21 at 800. The tank-only plan requires five, six, or seven returns respectively. These counts exclude the time spent finding water, digging, climbing, and making purchasing decisions. They must not be presented as expected playtime.

A 600 cutoff adds a useful post-upgrade collection window while retaining substantial equipment choices. Raising it to 800 also permits complete tank and mining tracks in the same efficient run, but increases travel for players who neglect capacity. For the first candidate, keep prices intact and change only the cutoff so its effect can be assessed separately.

## Seeded supply

With the existing three-size distribution and independent 20% dry rolls, the 64-site sample has:

| Metric | Minimum | Median | Maximum |
| --- | ---: | ---: | ---: |
| Total starting water | 14,269 | 15,725 | 17,750 |
| Water in pockets centred within 76 HUD metres | 123 | 428 | 699 |
| Shallowest depth containing 400 cumulative water across the map width | 32 m | 60 m | 123 m |
| Shallowest depth containing 600 cumulative water across the map width | 58 m | 91 m | 128 m |
| Shallowest depth containing 800 cumulative water across the map width | 87 m | 125.5 m | 187 m |

Thirty-seven of the 64 sites contain at least 400 water in that shallow area; only two contain 600 there. None contain 800 there. These are supply bounds that sum all pockets across the map width, not reachable routes or predictions of how far a player will actually descend. They show that neither the old cutoff nor the proposed one requires approaching the map's 2,000-metre bottom.

Eleven sampled starters are dry. Reproducible dry-start examples include seeds **3041712678**, **2802362286**, and **3816266512**. Include a dry start in local readiness checks. Preserve the independent dry roll rather than imposing a wet quota or silently rerolling the initial pocket. An initially dry pocket especially needs controls and feedback that explain the empty discovery without assuming the player already owns a detector.

## Limits and follow-up

This analysis does not measure enjoyment, difficulty, actual return time, or whether the controls teach themselves. It assumes players can discover and collect the generated water. Before release, complete normal playthroughs without developer credits, including wet and dry starts. Assess early purchase pacing, collection and return trips, meaningful equipment tradeoffs, and whether a mining-focused run reaches its extreme upgrades with enough play left to use them. Tune prices, upgrade effects, or the delivery cutoff as needed and confirm the final balance. This is separate from the completed arithmetic audit.

The release should remain a bounded demo with a thank-you ending; artifact searching and additional cave systems remain full-version work. Reports from the released demo can inform further small balance patches after this initial tuning pass.
