import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buyUpgrade, createTank, upgradeAvailability } from '../src/game/economy';

describe('economy audit purchase plans', () => {
  it('reports locked fixed plans and executes a separate valid unlock example', () => {
    const auditPath = fileURLToPath(new URL('./economy-audit.mjs', import.meta.url));
    const report = JSON.parse(execFileSync(process.execPath, [auditPath, '--seeds', '1', '--json'], {
      encoding: 'utf8', timeout: 15_000,
    }));
    expect(report.candidateLimits[600]['tank only']).toMatchObject({
      returns: 30, purchased: 0, completeAt: null,
      blocked: { id: 'capacity', requiredPurchases: 4, purchasedCount: 0 },
    });
    expect(report.candidateLimits[600]['climbing and double jump']).toMatchObject({
      purchased: 0, blocked: { id: 'climbSpeed', requiredPurchases: 3, purchasedCount: 0 },
    });

    const example = report.unlockProgressionExamples[600]['tank-priority mining'];
    const tank = createTank();
    expect(example.purchased).toBeGreaterThan(0);
    expect(example.ledger[0].purchases).toEqual(['digRadius']);
    for (const entry of example.ledger) {
      tank.credits += entry.delivered - (entry.return === 1 ? 0 : example.ledger[entry.return - 2].delivered);
      for (const id of entry.purchases) {
        expect(entry.delivered).toBeLessThan(600);
        expect(upgradeAvailability(tank, id)).toBe('available');
        expect(buyUpgrade(tank, id)).toBe(true);
      }
    }
    expect(example.purchased).toBe(Object.values(tank.upgrades).reduce((sum, level) => sum + level, 0));
    expect(tank.credits + example.spent).toBe(600);
  }, 20_000);
});
