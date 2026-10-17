import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Supply and purchase arithmetic, not a bot or a play-time prediction.
// The game modules are loaded directly so prices and generation cannot drift.
const seedArgument = process.argv.indexOf('--seeds');
const seedCount = seedArgument < 0 ? 64 : Number(process.argv[seedArgument + 1]);
const jsonOutput = process.argv.includes('--json');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const seedRule = 'Math.imul(index, 0x9e3779b1) >>> 0';
assert(Number.isInteger(seedCount) && seedCount > 0 && seedCount <= 1024,
  '--seeds must be an integer from 1 through 1024');
const server = await createServer({ configFile: false, root, logLevel: 'silent', server: { middlewareMode: true, watch: null } });
try {
  const { UPGRADE_DEFINITIONS, UPGRADE_REVEAL_ORDER, createTank, buyUpgrade, depositAtHopper,
    upgradeAvailability, purchasedUpgradeCount } = await server.ssrLoadModule('/src/game/economy.ts');
  const { generateSite } = await server.ssrLoadModule('/src/game/generation.ts');
  const { DEMO_DELIVERY_LIMIT } = await server.ssrLoadModule('/src/game/session.ts');
  const repeat = (id, count) => Array(count).fill(id);
  const mining = [...repeat('digRadius', 7), ...repeat('digDamage', 3), ...repeat('digSpeed', 3)];
  const plans = {
    'tank only': repeat('capacity', 9),
    'mining only': mining,
    'one tank then mining': ['capacity', ...mining],
    'tank then mining': [...repeat('capacity', 9), ...mining],
    'climbing and double jump': [...repeat('climbSpeed', 7), 'doubleJump'],
  };
  const unlockExamples = { 'tank-priority mining': ['capacity', 'digRadius', 'digDamage', 'digSpeed'] };
  const definitionFor = id => UPGRADE_DEFINITIONS.find(definition => definition.id === id);
  function blockedPurchase(tank, id, delivered) {
    const definition = definitionFor(id);
    const purchasedCount = purchasedUpgradeCount(tank);
    const eligibleOrder = UPGRADE_REVEAL_ORDER.filter(candidate => {
      const prerequisite = definitionFor(candidate).requires;
      return !prerequisite || tank.upgrades[prerequisite] > 0;
    });
    const requiredPurchases = eligibleOrder.indexOf(id);
    const reason = definition.requires && !tank.upgrades[definition.requires]
      ? `requires ${definition.requires}`
      : `requires ${requiredPurchases} purchased visible levels; currently ${purchasedCount}`;
    return { id, delivered, requiredPurchases: requiredPurchases < 0 ? null : requiredPurchases, purchasedCount, reason };
  }
  function purchasePlan(plan, limit, priorities = null) {
    const tank = createTank();
    let delivered = 0, returns = 0, index = 0, completeAt = null, blocked = null;
    const ledger = [];
    while (delivered < limit) {
      const capacity = tank.capacity;
      tank.water = Math.min(capacity, limit - delivered);
      delivered += depositAtHopper(tank, { x: 0, y: 0 }, { x: 0, y: 0 }, 1);
      returns++;
      const purchases = [];
      // Actual ending freezes the session; no purchase at the cutoff.
      if (delivered < limit) {
        while (index < plan.length && !blocked) {
          // The separate priority example may choose any affordable target
          // track that has actually been revealed; strict plans never skip.
          const id = priorities ? priorities.find(candidate =>
            tank.upgrades[candidate] < definitionFor(candidate).costs.length
            && upgradeAvailability(tank, candidate) === 'available') : plan[index];
          if (!id) break;
          const availability = upgradeAvailability(tank, id);
          if (availability === 'unavailable') {
            blocked = blockedPurchase(tank, id, delivered);
            break;
          }
          if (availability !== 'available') break;
          assert(buyUpgrade(tank, id), `Eligible ${id} purchase must succeed`);
          purchases.push(id);
          index++;
        }
        if (index === plan.length && completeAt === null) completeAt = delivered;
      }
      ledger.push({ return: returns, delivered, capacity, purchases });
    }
    const spent = UPGRADE_DEFINITIONS.reduce((sum, definition) =>
      sum + definition.costs.slice(0, tank.upgrades[definition.id]).reduce((s, cost) => s + cost, 0), 0);
    assert.equal(delivered, tank.credits + spent, 'Every delivered unit must be accounted for');
    return { returns, completeAt, waterAfterFinalPurchase: completeAt === null ? 0 : limit - completeAt,
      status: completeAt !== null ? 'completed' : blocked ? 'blocked' : 'cutoff', blocked,
      purchased: index, planned: plan.length, spent, ledger };
  }
  const wetPockets = (world) => {
    const visited = new Uint8Array(world.water.length);
    const pockets = [];
    for (let index = 0; index < world.water.length; index++) {
      if (!world.water[index] || visited[index]) continue;
      const cells = [index];
      visited[index] = 1;
      let mass = 0, sumX = 0, sumY = 0;
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i], water = world.water[cell];
        mass += water; sumX += (cell % world.width) * water;
        sumY += Math.floor(cell / world.width) * water;
        for (const neighbor of [cell - 1, cell + 1, cell - world.width, cell + world.width]) {
          if (world.water[neighbor] && !visited[neighbor]) {
            visited[neighbor] = 1; cells.push(neighbor);
          }
        }
      }
      pockets.push({ water: mass, column: sumX / mass, depth: sumY / mass - 44 });
    }
    return pockets.sort((a, b) => a.depth - b.depth);
  };
  const seeds = [];
  for (let index = 0; index < seedCount; index++) {
    // Spread across the uint32 range: consecutive tiny seeds have correlated
    // first LCG draws and are a poor sample of the starter's dry roll.
    const seed = Math.imul(index, 0x9e3779b1) >>> 0;
    const { world } = generateSite(seed);
    const pockets = wetPockets(world);
    const starter = pockets.find(pocket => pocket.column >= 163 && pocket.column < 185 && pocket.depth > 45 && pocket.depth < 65);
    let cumulative = 0;
    const depthTo = Object.fromEntries([400, 600, 800].map(limit => [limit, null]));
    for (const pocket of pockets) {
      cumulative += pocket.water;
      for (const limit of [400, 600, 800]) if (depthTo[limit] === null && cumulative >= limit) {
        depthTo[limit] = Number(pocket.depth.toFixed(1));
      }
    }
    seeds.push({ seed, starterDry: !starter, starterWater: starter?.water ?? 0, totalWater: cumulative,
      waterThrough76m: pockets.filter(pocket => pocket.depth <= 76).reduce((sum, pocket) => sum + pocket.water, 0), depthTo });
  }
  const summarize = values => {
    const sorted = [...values].sort((a, b) => a - b);
    return { min: sorted[0], median: (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2,
      max: sorted.at(-1) };
  };
  const report = {
    version: manifest.version,
    createdAt: new Date().toISOString(),
    parameters: { seedCount, seedRule, candidateLimits: [400, 600, 800] },
    caveat: 'Perfect collection, full returns, and purchases only at hopper. Omits discovery, excavation, travel, player decisions and elapsed time. Depth sums all pockets across map width; it is a supply bound, not a route.',
    currentLimit: DEMO_DELIVERY_LIMIT,
    progression: { revealOrder: UPGRADE_REVEAL_ORDER,
      rule: 'Start with one track; each purchased visible equipment level reveals another. Skip unmet prerequisites in the prefix and retain owned tracks. Maximum tracks retain their position; hidden scanner purchases do not count.' },
    visibleEquipmentTotal: UPGRADE_DEFINITIONS.filter(definition => !definition.hidden)
      .reduce((sum, definition) => sum + definition.costs.reduce((s, cost) => s + cost, 0), 0),
    candidateLimits: Object.fromEntries([400, 600, 800].map(limit => [limit,
      Object.fromEntries(Object.entries(plans).map(([name, plan]) => [name, purchasePlan(plan, limit)]))])),
    unlockProgressionExamples: Object.fromEntries([400, 600, 800].map(limit => [limit,
      Object.fromEntries(Object.entries(unlockExamples).map(([name, priorities]) => [name, {
        priorities,
        ...purchasePlan(priorities.flatMap(id => repeat(id, definitionFor(id).costs.length)), limit, priorities),
      }]))])),
    supply: { dispersedSeeds: seedCount, seedRule, dryStarters: seeds.filter(seed => seed.starterDry).length,
      dryStarterExamples: seeds.filter(seed => seed.starterDry).slice(0, 8).map(seed => seed.seed),
      totalWater: summarize(seeds.map(seed => seed.totalWater)),
      waterThrough76m: summarize(seeds.map(seed => seed.waterThrough76m)),
      sitesWithoutShallowSupply: Object.fromEntries([400, 600, 800].map(limit => [limit, seeds.filter(seed => seed.waterThrough76m < limit).length])),
      minimumDepthForSupply: Object.fromEntries([400, 600, 800].map(limit => [limit, summarize(seeds.map(seed => seed.depthTo[limit]))])) },
    seeds,
  };
  const destination = path.join(root, 'benchmark-results', 'economy.json');
  await mkdir(path.dirname(destination), { recursive: true });
  const json = `${JSON.stringify(report, null, 2)}\n`;
  await writeFile(destination, json);
  if (jsonOutput) console.log(json.trimEnd());
  else {
    console.log(`Water Hole v${report.version} economy audit; ${report.createdAt}`);
    console.log(`Current cutoff: ${report.currentLimit}; all visible upgrades: ${report.visibleEquipmentTotal} credits.`);
    console.log(`Reveal order: ${UPGRADE_REVEAL_ORDER.join(' → ')}.`);
    console.log(`Current ${report.currentLimit}-water strict purchase plans (no skipped or substitute purchases):`);
    console.table(Object.entries(report.candidateLimits[report.currentLimit]).map(([plan, result]) => ({
      plan, returns: result.returns, 'final purchase at': result.completeAt ?? 'not completed',
      'water afterward': result.waterAfterFinalPurchase, purchases: `${result.purchased}/${result.planned}`,
      constraint: result.blocked ? `${result.blocked.id}: ${result.blocked.reason}` : result.status,
    })));
    console.log('Separate unlock progression examples (first affordable, revealed track in priority order):');
    console.table(Object.entries(report.unlockProgressionExamples[report.currentLimit]).map(([plan, result]) => ({
      plan, priorities: result.priorities.join(' → '), returns: result.returns,
      purchases: `${result.purchased}/${result.planned}`, spent: result.spent,
      'final purchase at': result.completeAt ?? 'not completed', status: result.status,
    })));
    console.log('Strict-plan cutoff comparisons (locked plans retain their original constraint):');
    console.table(Object.entries(report.candidateLimits).map(([cutoff, plans]) => ({
      cutoff, 'tank returns': plans['tank only'].returns,
      'after maximum tank': plans['tank only'].waterAfterFinalPurchase,
      'one-tank/mining returns': plans['one tank then mining'].returns,
      'after maximum mining': plans['one tank then mining'].waterAfterFinalPurchase,
      'tank + mining complete': plans['tank then mining'].completeAt ?? 'no',
    })));
    console.log(`Supply: ${seedCount} dispersed seeds; ${report.supply.dryStarters} dry starters; seed = ${seedRule}.`);
    console.table([
      { metric: 'total water', ...report.supply.totalWater },
      { metric: 'water through 76 m', ...report.supply.waterThrough76m },
      ...Object.entries(report.supply.minimumDepthForSupply).map(([cutoff, stats]) => ({
        metric: `depth for ${cutoff} supply (m)`, ...stats,
      })),
    ]);
    console.log(`Sites without 600 shallow water: ${report.supply.sitesWithoutShallowSupply[600]}/${seedCount}.`);
    console.log(report.caveat);
    console.log(`Full audit: ${destination} (use --json for JSON on stdout).`);
  }
} finally {
  await server.close();
}
