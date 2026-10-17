import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buyUpgrade, createTank, upgradeAvailability } from '../src/game/economy';

describe('economy audit purchase plans', () => {
  it('uses the depth ending and permits purchases at delivered-water budgets', () => {
    const auditPath = fileURLToPath(new URL('./economy-audit.mjs', import.meta.url));
    const report = JSON.parse(execFileSync(process.execPath, [auditPath, '--seeds', '1', '--json'], {
      encoding: 'utf8', timeout: 15_000,
    }));
    expect(report.endCondition).toEqual({ kind: 'depth', depth: 2000 });
    expect(report).not.toHaveProperty('currentLimit');
    expect(report).not.toHaveProperty('candidateLimits');
    expect(report.deliveredWaterBudgets[600]['tank only']).toMatchObject({
      returns: 30, purchased: 0, completeAt: null,
      blocked: { id: 'capacity', requiredPurchases: 4, purchasedCount: 0 },
    });
    expect(report.deliveredWaterBudgets[600]['climbing and double jump']).toMatchObject({
      purchased: 0, blocked: { id: 'climbSpeed', requiredPurchases: 3, purchasedCount: 0 },
    });

    expect(report.deliveredWaterBudgets[400]['mining only'].ledger.at(-1).purchases).toContain('digRadius');
    expect(report.unlimitedBudgetPlans['mining only']).toMatchObject({
      status: 'completed', purchased: 13, planned: 13, spent: 750, completeAt: 760,
    });
    const example = report.unlimitedBudgetPlans['all visible equipment'];
    const tank = createTank();
    expect(example.purchased).toBeGreaterThan(0);
    expect(example.ledger[0].purchases).toEqual(['digRadius']);
    for (const entry of example.ledger) {
      tank.credits += entry.delivered - (entry.return === 1 ? 0 : example.ledger[entry.return - 2].delivered);
      for (const id of entry.purchases) {
        expect(upgradeAvailability(tank, id)).toBe('available');
        expect(buyUpgrade(tank, id)).toBe(true);
      }
    }
    expect(example.purchased).toBe(Object.values(tank.upgrades).reduce((sum, level) => sum + level, 0));
    expect(example.purchased).toBe(example.planned);
    expect(example.spent).toBe(report.visibleEquipmentTotal);
    expect(tank.credits + example.spent).toBe(example.ledger.at(-1).delivered);
  }, 20_000);
});
