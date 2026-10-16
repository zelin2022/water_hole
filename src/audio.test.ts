import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine } from './audio';

class FakeParam {
  value = 0;
  calls: { method: string; value: number; time: number }[] = [];
  setValueAtTime(value: number, time: number): void { this.value = value; this.calls.push({ method: 'set', value, time }); }
  linearRampToValueAtTime(value: number, time: number): void { this.value = value; this.calls.push({ method: 'linear', value, time }); }
  exponentialRampToValueAtTime(value: number, time: number): void { this.value = value; this.calls.push({ method: 'exponential', value, time }); }
  cancelScheduledValues(time: number): void { this.calls.push({ method: 'cancel', value: this.value, time }); }
  cancelAndHoldAtTime(time: number): void { this.calls.push({ method: 'hold', value: this.value, time }); }
}
class FakeGain {
  gain = new FakeParam();
  constructor() { this.gain.value = 1; }
  connected: unknown[] = [];
  disconnect = vi.fn();
  connect(target: unknown): void { this.connected.push(target); }
}
class FakeOscillator {
  type = 'sine';
  frequency = new FakeParam();
  connected: unknown[] = [];
  started: number[] = [];
  stopped: number[] = [];
  onended: (() => void) | null = null;
  disconnect = vi.fn();
  connect(target: unknown): void { this.connected.push(target); }
  start(time: number): void { this.started.push(time); }
  stop(time: number): void { this.stopped.push(time); }
}
class FakeContext {
  static instances: FakeContext[] = [];
  currentTime = 0;
  state = 'running';
  destination = {};
  gains: FakeGain[] = [];
  oscillators: FakeOscillator[] = [];
  constructor() { FakeContext.instances.push(this); }
  createGain(): FakeGain { const gain = new FakeGain(); this.gains.push(gain); return gain; }
  createOscillator(): FakeOscillator { const oscillator = new FakeOscillator(); this.oscillators.push(oscillator); return oscillator; }
  async resume(): Promise<void> { this.state = 'running'; }
}

describe('audio scheduling and transitions', () => {
  beforeEach(() => { vi.useFakeTimers(); FakeContext.instances = []; vi.stubGlobal('AudioContext', FakeContext); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('starts both master buses silent before their first volume ramp', async () => {
    const engine = new AudioEngine();
    await engine.unlock();
    const [music, effects] = FakeContext.instances[0].gains;
    expect(music.gain.calls[0]).toMatchObject({ method: 'hold', value: 0, time: 0 });
    expect(effects.gain.calls[0]).toMatchObject({ method: 'hold', value: 0, time: 0 });
  });

  it('ramps pause and music volume without changing the independent effects volume', async () => {
    const engine = new AudioEngine();
    await engine.unlock();
    const context = FakeContext.instances[0];
    engine.volumes(0.5, 0.4);
    const [music, effects] = context.gains;
    expect(music.gain.calls.at(-1)).toMatchObject({ method: 'linear', value: 0.09 });
    expect(effects.gain.calls.at(-1)).toMatchObject({ method: 'linear', value: 0.12 });
    const effectsCalls = effects.gain.calls.length;
    engine.setActive(false);
    expect(music.gain.calls.at(-1)).toMatchObject({ method: 'linear', value: 0 });
    expect(effects.gain.calls).toHaveLength(effectsCalls);
    engine.setActive(true);
    expect(music.gain.calls.at(-1)).toMatchObject({ method: 'linear', value: 0.09 });
  });

  it('changes scene layer gains without restarting the phrase or duplicating a scheduler', async () => {
    const engine = new AudioEngine();
    await engine.unlock();
    const context = FakeContext.instances[0];
    const timerCount = vi.getTimerCount();
    await engine.unlock();
    expect(FakeContext.instances).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(timerCount);
    engine.setScene(160, 1);
    context.currentTime = 0.4;
    vi.advanceTimersByTime(50);
    const returning = context.gains[3];
    const depth = context.gains[4];
    expect(returning.gain.value).toBeGreaterThan(0);
    expect(returning.gain.value).toBeLessThan(1);
    expect(depth.gain.value).toBeGreaterThan(0);
    expect(depth.gain.value).toBeLessThan(1);
    const count = context.oscillators.length;
    engine.setScene(0, 0);
    vi.advanceTimersByTime(50);
    expect(context.oscillators).toHaveLength(count);
  });

  it('skips missed beats instead of bursting after a long inactive interval, and releases finished nodes', async () => {
    const engine = new AudioEngine();
    await engine.unlock();
    const context = FakeContext.instances[0];
    engine.setActive(false);
    const pausedCount = context.oscillators.length;
    context.currentTime = 100;
    vi.advanceTimersByTime(1000);
    expect(context.oscillators).toHaveLength(pausedCount);
    engine.setActive(true);
    vi.advanceTimersByTime(50);
    expect(context.oscillators.length - pausedCount).toBeLessThanOrEqual(8);
    for (const oscillator of context.oscillators) {
      expect(oscillator.started[0]).toBeGreaterThanOrEqual(0);
      expect(oscillator.stopped[0]).toBeGreaterThan(oscillator.started[0]);
      oscillator.onended?.();
      expect(oscillator.disconnect).toHaveBeenCalledOnce();
      expect((oscillator.connected[0] as FakeGain).disconnect).toHaveBeenCalledOnce();
    }
  });

  it('keeps effects available with music muted, including during a paused scene', async () => {
    const engine = new AudioEngine();
    await engine.unlock();
    const context = FakeContext.instances[0];
    engine.volumes(0, 0.4);
    engine.setActive(false);
    const musicCount = context.oscillators.length;
    context.currentTime = 2;
    vi.advanceTimersByTime(1000);
    expect(context.oscillators).toHaveLength(musicCount);
    engine.play('menu');
    expect(context.oscillators).toHaveLength(musicCount + 1);
    const effectEnvelope = context.oscillators.at(-1)!.connected[0] as FakeGain;
    expect(effectEnvelope.connected).toEqual([context.gains[1]]);
    engine.volumes(0, 0);
    context.currentTime = 3;
    engine.play('buy');
    expect(context.oscillators).toHaveLength(musicCount + 1);
  });
});
