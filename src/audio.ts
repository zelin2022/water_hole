export type Sound = 'strike' | 'break' | 'collect' | 'unload' | 'buy' | 'sonar' | 'menu' | 'end';

/** Small original synthesised score and effects; no network or external audio assets. */
export class AudioEngine {
  private context: AudioContext | undefined;
  private musicBus: GainNode | undefined;
  private effectsBus: GainNode | undefined;
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
      this.musicBus.connect(this.context.destination);
      this.effectsBus.connect(this.context.destination);
      this.volumes(this.music, this.effects);
      setInterval(() => this.score(), 800);
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }
  volumes(music: number, effects: number): void {
    this.music = music;
    this.effects = effects;
    if (this.musicBus) this.musicBus.gain.value = this.active ? music * 0.18 : 0;
    if (this.effectsBus) this.effectsBus.gain.value = effects * 0.3;
  }
  setActive(active: boolean): void { this.active = active; this.volumes(this.music, this.effects); }
  private tone(frequency: number, duration: number, bus: GainNode, volume: number, type: OscillatorType = 'sine', endFrequency = frequency): void {
    const ctx = this.context!;
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    const now = ctx.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(volume, now + Math.min(0.025, duration / 5));
    envelope.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(envelope); envelope.connect(bus);
    oscillator.start(now); oscillator.stop(now + duration + 0.03);
  }
  private score(): void {
    if (!this.context || !this.musicBus || !this.active || this.music === 0) return;
    const melody = [220, 261.63, 329.63, 293.66, 220, 196, 261.63, 246.94, 220, 329.63, 293.66, 261.63, 196, 164.81, 196, 220];
    this.tone(melody[this.beat % melody.length], 1.5, this.musicBus, 0.25, 'sine');
    if (this.beat % 4 === 0) {
      const root = [110, 87.31, 98, 82.41][Math.floor(this.beat / 4) % 4];
      this.tone(root, 3.1, this.musicBus, 0.3, 'sine');
      this.tone(root * 1.5, 3.1, this.musicBus, 0.13, 'sine');
    }
    this.beat++;
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
