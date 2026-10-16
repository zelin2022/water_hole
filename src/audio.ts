import { advanceMusicMix, MUSIC_BEAT_SECONDS, musicMix, musicNotes } from './music';
import type { MusicMix } from './music';

export type Sound = 'strike' | 'break' | 'collect' | 'unload' | 'buy' | 'sonar' | 'menu' | 'end';

/** Small original synthesised score and effects; no network or external audio assets. */
export class AudioEngine {
  private context: AudioContext | undefined;
  private musicBus: GainNode | undefined;
  private effectsBus: GainNode | undefined;
  private layers: Record<keyof MusicMix, GainNode> | undefined;
  private mix = musicMix(0, 0);
  private targetMix = musicMix(0, 0);
  private lastMixAt = 0;
  private nextBeatAt = 0;
  private music = 0.25;
  private effects = 0.65;
  private active = true;
  private beat = 0;
  private lastEffect = new Map<Sound, number>();

  async unlock(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext();
      this.musicBus = this.context.createGain();
      this.effectsBus = this.context.createGain();
      this.musicBus.gain.value = 0;
      this.effectsBus.gain.value = 0;
      this.musicBus.connect(this.context.destination);
      this.effectsBus.connect(this.context.destination);
      const layer = (volume: number) => {
        const bus = this.context!.createGain();
        bus.gain.value = volume;
        bus.connect(this.musicBus!);
        return bus;
      };
      this.layers = {
        exploration: layer(this.mix.exploration), returning: layer(this.mix.returning),
        depth: layer(this.mix.depth), surface: layer(this.mix.surface),
      };
      this.lastMixAt = this.context.currentTime;
      this.nextBeatAt = this.context.currentTime + 0.025;
      this.volumes(this.music, this.effects);
      setInterval(() => this.score(), 50);
      this.score();
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }
  volumes(music: number, effects: number): void {
    this.music = this.volume(music);
    this.effects = this.volume(effects);
    if (this.musicBus) this.ramp(this.musicBus, this.active ? this.music * 0.18 : 0, 0.15);
    if (this.effectsBus) this.ramp(this.effectsBus, this.effects * 0.3, 0.08);
  }
  setActive(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    if (this.musicBus) this.ramp(this.musicBus, active ? this.music * 0.18 : 0, 0.15);
  }
  setScene(depth: number, tankFill: number): void { this.targetMix = musicMix(depth, tankFill); }
  private volume(value: number): number { return Number.isNaN(value) ? 0 : Math.max(0, Math.min(1, value)); }
  private ramp(bus: GainNode, volume: number, duration: number): void {
    const now = this.context!.currentTime;
    // Holding the current automation value keeps interrupted fades continuous.
    bus.gain.cancelAndHoldAtTime(now);
    bus.gain.linearRampToValueAtTime(volume, now + duration);
  }
  private tone(frequency: number, duration: number, bus: GainNode, volume: number, type: OscillatorType = 'sine', endFrequency = frequency, startAt?: number, attack = 0.025): void {
    const ctx = this.context!;
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    const now = startAt ?? ctx.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(volume, now + Math.min(attack, duration / 3));
    envelope.gain.exponentialRampToValueAtTime(0.001, now + duration);
    envelope.gain.linearRampToValueAtTime(0, now + duration + 0.025);
    oscillator.connect(envelope); envelope.connect(bus);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
    oscillator.start(now); oscillator.stop(now + duration + 0.03);
  }
  private score(): void {
    if (!this.context || !this.musicBus || !this.layers) return;
    const now = this.context.currentTime;
    this.mix = advanceMusicMix(this.mix, this.targetMix, now - this.lastMixAt);
    this.lastMixAt = now;
    for (const key of Object.keys(this.layers) as (keyof MusicMix)[]) this.ramp(this.layers[key], this.mix[key], 0.06);
    if (!this.active || this.music === 0 || this.context.state !== 'running') return;
    // Background throttling or a long pause must never cause a catch-up burst.
    if (this.nextBeatAt < now - 0.1) this.nextBeatAt = now + 0.025;
    while (this.nextBeatAt < now + 0.12) {
      for (const note of musicNotes(this.beat)) {
        const bus = note.layer === 'common' ? this.musicBus : this.layers[note.layer];
        this.tone(note.frequency, note.duration, bus, note.volume, note.type, note.frequency, this.nextBeatAt + note.offset, note.attack);
      }
      this.beat++;
      this.nextBeatAt += MUSIC_BEAT_SECONDS;
    }
  }
  play(sound: Sound): void {
    if (!this.context || !this.effectsBus || this.effects === 0) return;
    const now = this.context.currentTime;
    const interval = sound === 'collect' || sound === 'unload' ? 0.14 : 0.04;
    if (now - (this.lastEffect.get(sound) ?? -10) < interval) return;
    this.lastEffect.set(sound, now);
    const bus = this.effectsBus;
    switch (sound) {
      case 'strike': this.tone(190, 0.09, bus, 0.55, 'triangle', 65); this.tone(1100, 0.045, bus, 0.13, 'sine', 700); break;
      case 'break': this.tone(100, 0.18, bus, 0.5, 'triangle', 35); break;
      case 'collect': this.tone(390, 0.1, bus, 0.12, 'sine', 470); break;
      case 'unload': this.tone(210, 0.12, bus, 0.15, 'sine', 150); break;
      case 'buy': this.tone(440, 0.3, bus, 0.35); this.tone(660, 0.4, bus, 0.22); break;
      case 'sonar': this.tone(880, 0.65, bus, 0.45, 'sine', 650); break;
      case 'end': this.tone(220, 1.2, bus, 0.35); this.tone(330, 1.4, bus, 0.2); this.tone(440, 1.6, bus, 0.15); break;
      case 'menu': this.tone(480, 0.065, bus, 0.15); break;
    }
  }
}
