import { describe, expect, it } from 'vitest';
import { benchmarkDefinitions, cpuLoadPercent, executeScenario, summarizeTimings, worldMetrics } from '../scripts/benchmark-scenarios';

describe('short release stress benchmark', () => {
  it('computes measured percentiles and distinguishes one-core from machine CPU load', () => {
    expect(summarizeTimings([8, 1, 2, 4, 3])).toEqual({ samples: 5, meanMs: 3.6, p50Ms: 3, p95Ms: 8, maxMs: 8 });
    expect(cpuLoadPercent(500_000, 1000, 8)).toEqual({ oneCorePercent: 50, machineCapacityPercent: 6.25 });
    expect(summarizeTimings([])).toEqual({ samples: 0, meanMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0 });
  });

  it('creates adversarial full-depth terrain and many active water rows without putting water in rock', () => {
    for (const id of ['deep-tunnel', 'many-water-bodies', 'maximum-mining']) {
      const scenario = benchmarkDefinitions.find(definition => definition.id === id)!.create({ width: 64, height: 96 });
      const before = worldMetrics(scenario.world);
      expect(before.invalidWaterCells).toBe(0);
      if (id === 'deep-tunnel') {
        expect(scenario.world.isSolid(32, 1)).toBe(false);
        expect(scenario.world.isSolid(32, 94)).toBe(false);
      }
      if (id === 'many-water-bodies') {
        expect(before.activeWaterRows).toBeGreaterThan(10);
        expect(before.activeWaterCells).toBeGreaterThan(200);
      }
      const result = executeScenario(scenario, { iterations: 3, maxDurationMs: 1000 });
      expect(result.iterations).toBe(3);
      expect(result.water.absoluteDrift).toBeLessThan(0.002);
      expect(result.after.invalidWaterCells).toBe(0);
      expect(Object.values(result.operations).every(operation => operation.samples > 0)).toBe(true);
      if (id === 'maximum-mining') expect(result.after.solidCells).toBeLessThan(before.solidCells);
      if (id === 'many-water-bodies') expect(result.after.activeWaterCells).not.toBe(before.activeWaterCells);
    }
  });

  it('runs the actual current-size generated demo without moving water into terrain', () => {
    const scenario = benchmarkDefinitions.find(definition => definition.id === 'normal-demo')!.create();
    const result = executeScenario(scenario, { iterations: 2, maxDurationMs: 1000 });
    expect(result.before.width).toBe(384);
    expect(result.before.height).toBe(2053);
    expect(result.before.activeWaterCells).toBeGreaterThan(0);
    expect(result.water.absoluteDrift).toBeLessThan(0.01);
    expect(result.operations['session-step'].samples).toBe(2);
    expect(result.operations['normal-vision'].samples).toBe(2);
    expect(result.after.invalidWaterCells).toBe(0);
  });

  it('caps a scenario by measured work and rejects an unbounded iteration request', () => {
    const scenario = benchmarkDefinitions.find(definition => definition.id === 'many-water-bodies')!.create({ width: 32, height: 40 });
    let ticks = 0;
    const result = executeScenario(scenario, { iterations: 100, maxDurationMs: 3, clock: () => ticks++ });
    expect(result.iterations).toBeGreaterThan(0);
    expect(result.iterations).toBeLessThan(100);
    expect(result.stoppedAtBudget).toBe(true);
    expect(() => executeScenario(scenario, { iterations: Infinity, maxDurationMs: 100 })).toThrow(RangeError);
    expect(() => executeScenario(scenario, { iterations: 2, maxDurationMs: Infinity })).toThrow(RangeError);
  });
});
