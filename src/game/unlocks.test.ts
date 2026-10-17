import { describe, expect, it } from 'vitest';
import { buyUpgrade, createTank, isUpgradeRevealed, purchasedUpgradeCount, revealedUpgradeIds, UPGRADE_DEFINITIONS, UPGRADE_REVEAL_ORDER, upgradeAvailability, type Tank, type UpgradeId } from './economy';

const revealOrder: UpgradeId[] = [
  'digRadius', 'digDamage', 'detector', 'climbSpeed', 'capacity', 'jumpPower', 'digSpeed',
  'sonar', 'wallDig', 'doubleJump', 'headlampDepth', 'torsoLamp', 'detectorRange', 'headlampWidth',
];

function offeredUpgrades(tank: Tank): UpgradeId[] {
  return revealOrder.filter(id => upgradeAvailability(tank, id) !== 'unavailable');
}

describe('purchase-count equipment reveals', () => {
  it('starts with only the wider pick and cannot bypass locked tracks with developer credits', () => {
    const tank = createTank();
    tank.water = 12;
    expect(upgradeAvailability(tank, 'digRadius')).toBe('unaffordable');
    tank.credits = 10000;
    expect(offeredUpgrades(tank)).toEqual(['digRadius']);
    const before = structuredClone(tank);
    for (const id of [...revealOrder.slice(1), 'subsurfaceScanner'] as UpgradeId[]) {
      expect(upgradeAvailability(tank, id)).toBe('unavailable');
      expect(buyUpgrade(tank, id)).toBe(false);
      expect(tank).toEqual(before);
    }
  });

  it('reveals the next eligible track after every purchased level in the approved order', () => {
    const tank = createTank();
    tank.credits = 10000;
    tank.water = 12;
    const purchases: UpgradeId[] = [
      ...Array<UpgradeId>(7).fill('digRadius'), ...Array<UpgradeId>(3).fill('digDamage'),
      'climbSpeed', 'climbSpeed', 'detector',
    ];
    let spent = 0;
    let previouslyRevealed: UpgradeId[] = [];
    for (let count = 0; count <= purchases.length; count++) {
      const eligible = revealOrder.filter(id => id !== 'detectorRange' || tank.upgrades.detector > 0);
      const expected = eligible.slice(0, count + 1).filter(id => {
        const definition = UPGRADE_DEFINITIONS.find(item => item.id === id)!;
        return tank.upgrades[id] < definition.costs.length;
      });
      expect(offeredUpgrades(tank)).toEqual(expected);
      const revealed = revealedUpgradeIds(tank);
      expect(previouslyRevealed.every(id => revealed.includes(id))).toBe(true);
      expect(purchasedUpgradeCount(tank)).toBe(count);
      previouslyRevealed = revealed;
      expect(tank.water).toBe(12);
      expect(tank.credits).toBe(10000 - spent);
      if (count === purchases.length) break;
      const id = purchases[count];
      spent += UPGRADE_DEFINITIONS.find(item => item.id === id)!.costs[tank.upgrades[id]];
      expect(buyUpgrade(tank, id)).toBe(true);
    }
    expect(upgradeAvailability(tank, 'detectorRange')).toBe('available');
    expect(upgradeAvailability(tank, 'headlampWidth')).toBe('available');
  });

  it('keeps the detector amplifier locked until its reveal slot even after buying the detector', () => {
    const tank = createTank();
    tank.credits = 10000;
    expect(buyUpgrade(tank, 'digRadius')).toBe(true);
    expect(buyUpgrade(tank, 'digRadius')).toBe(true);
    expect(buyUpgrade(tank, 'detector')).toBe(true);
    expect(upgradeAvailability(tank, 'climbSpeed')).toBe('available');
    expect(upgradeAvailability(tank, 'detectorRange')).toBe('unavailable');

    tank.upgrades.digRadius = 7;
    tank.upgrades.digDamage = 3;
    tank.upgrades.climbSpeed = 1;
    expect(upgradeAvailability(tank, 'detectorRange')).toBe('available');
    expect(upgradeAvailability(tank, 'headlampWidth')).toBe('unavailable');
    expect(buyUpgrade(tank, 'detectorRange')).toBe(true);
    expect(upgradeAvailability(tank, 'headlampWidth')).toBe('available');
  });

  it('fills the amplifier slot with the wider headlamp when the detector is unowned', () => {
    const tank = createTank();
    tank.credits = 10000;
    tank.upgrades.digRadius = 7;
    tank.upgrades.digDamage = 3;
    tank.upgrades.climbSpeed = 2;
    expect(upgradeAvailability(tank, 'detectorRange')).toBe('unavailable');
    expect(upgradeAvailability(tank, 'headlampWidth')).toBe('available');
    expect(buyUpgrade(tank, 'detector')).toBe(true);
    expect(upgradeAvailability(tank, 'detectorRange')).toBe('available');
    expect(upgradeAvailability(tank, 'headlampWidth')).toBe('available');
  });

  it('preserves an owned legacy track outside the reveal prefix and counts its purchased levels', () => {
    const tank = createTank();
    tank.credits = 500;
    tank.water = 9;
    tank.upgrades.headlampWidth = 1;
    expect(offeredUpgrades(tank)).toEqual(['digRadius', 'digDamage', 'headlampWidth']);
    expect(buyUpgrade(tank, 'headlampWidth')).toBe(true);
    expect(tank.upgrades.headlampWidth).toBe(2);
    expect(tank.credits).toBe(430);
    expect(tank.water).toBe(9);
    expect(offeredUpgrades(tank)).toEqual(['digRadius', 'digDamage', 'detector']);
  });

  it('does not count the hidden scanner or failed, unaffordable, or maxed purchases', () => {
    const tank = createTank();
    tank.upgrades.subsurfaceScanner = 1;
    expect(offeredUpgrades(tank)).toEqual(['digRadius']);
    expect(buyUpgrade(tank, 'digRadius')).toBe(false);
    expect(offeredUpgrades(tank)).toEqual(['digRadius']);
    tank.credits = 10000;
    expect(buyUpgrade(tank, 'subsurfaceScanner')).toBe(false);
    expect(buyUpgrade(tank, 'unknown' as UpgradeId)).toBe(false);
    expect(offeredUpgrades(tank)).toEqual(['digRadius']);
    tank.upgrades.digRadius = 7;
    const before = structuredClone(tank);
    expect(buyUpgrade(tank, 'digRadius')).toBe(false);
    expect(tank).toEqual(before);
    expect(offeredUpgrades(tank)).toEqual(revealOrder.slice(1, 8));
  });

  it('derives reveals from saved equipment while retaining completed tracks and hiding the scanner', () => {
    const tank = createTank();
    tank.upgrades.digRadius = 7;
    tank.upgrades.headlampWidth = 2;
    tank.upgrades.subsurfaceScanner = 1;
    const savedTank = JSON.parse(JSON.stringify(tank)) as Tank;
    expect(UPGRADE_REVEAL_ORDER).toEqual(revealOrder);
    expect(purchasedUpgradeCount(savedTank)).toBe(9);
    expect(revealedUpgradeIds(savedTank)).toEqual([...revealOrder.slice(0, 10), 'headlampWidth']);
    expect(isUpgradeRevealed(savedTank, 'digRadius')).toBe(true);
    expect(isUpgradeRevealed(savedTank, 'headlampWidth')).toBe(true);
    expect(isUpgradeRevealed(savedTank, 'subsurfaceScanner')).toBe(false);
    expect(upgradeAvailability(savedTank, 'digRadius')).toBe('unavailable');
    expect(upgradeAvailability(savedTank, 'headlampWidth')).toBe('unavailable');
  });
});
