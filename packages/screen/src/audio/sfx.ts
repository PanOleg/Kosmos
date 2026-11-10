/**
 * Синтезовані звуки на Web Audio. Контекст створюється на першому жесті користувача
 * (вимога браузерів, особливо iOS). Кожен звук — короткоживучі вузли, GC їх прибирає.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private lastShot = new Map<number, number>();

  constructor() {
    const unlock = () => this.ensure();
    for (const ev of ['keydown', 'pointerdown', 'touchstart'])
      window.addEventListener(ev, unlock, { once: false, passive: true });
  }

  private ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(comp).connect(ctx.destination);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private tone(
    type: OscillatorType,
    f0: number,
    f1: number,
    dur: number,
    peak: number,
    pan = 0,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    this.env(g, t, peak, 0.004, dur);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    o.connect(g).connect(p).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private burst(
    filter: BiquadFilterType,
    f0: number,
    f1: number,
    q: number,
    dur: number,
    peak: number,
    pan = 0,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = ctx.createGain();
    this.env(g, t, peak, 0.002, dur);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(f).connect(g).connect(p).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  /** pan: −1..1 за положенням на екрані. */
  shot(slot: number, pan: number): void {
    const now = this.ctx?.currentTime ?? 0;
    // Не частіше 20/с на гравця: при перевантаженні не перетворюється на шум.
    if (now - (this.lastShot.get(slot) ?? 0) < 0.05) return;
    this.lastShot.set(slot, now);
    const pitch = 1 + slot * 0.06 + (Math.random() - 0.5) * 0.08;
    this.tone('square', 900 * pitch, 180 * pitch, 0.07, 0.12, pan);
    this.burst('highpass', 4000, 1500, 0.7, 0.05, 0.18, pan);
  }

  hit(pan: number): void {
    this.burst('bandpass', 2400, 900, 3, 0.04, 0.22, pan);
  }

  kill(pan: number): void {
    this.tone('sine', 160, 40, 0.22, 0.5, pan);
    this.burst('lowpass', 2500, 120, 0.8, 0.25, 0.45, pan);
    this.tone('square', 520, 260, 0.06, 0.08, pan);
  }

  wallImpact(pan: number): void {
    this.burst('bandpass', 3200, 2000, 5, 0.025, 0.05, pan);
  }

  dash(): void {
    this.burst('bandpass', 600, 2800, 1.5, 0.18, 0.25);
  }

  windup(pan: number): void {
    this.tone('sawtooth', 220, 660, 0.3, 0.07, pan);
  }

  enemyAttack(pan: number): void {
    this.burst('bandpass', 900, 300, 2, 0.08, 0.2, pan);
  }

  playerHit(): void {
    this.tone('sine', 110, 50, 0.25, 0.6);
    this.burst('lowpass', 900, 100, 1, 0.2, 0.4);
  }

  playerDown(): void {
    this.tone('sawtooth', 300, 40, 0.9, 0.3);
  }

  pickup(pan: number, combo: number): void {
    const f = 880 * Math.pow(2, Math.min(combo, 12) / 12);
    this.tone('triangle', f, f * 1.5, 0.09, 0.15, pan);
  }
}
