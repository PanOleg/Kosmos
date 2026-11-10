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

  enemyShot(pan: number): void {
    this.tone('sawtooth', 300, 120, 0.12, 0.12, pan);
    this.burst('bandpass', 1500, 500, 2, 0.1, 0.18, pan);
  }

  playerHit(): void {
    this.tone('sine', 110, 50, 0.25, 0.6);
    this.burst('lowpass', 900, 100, 1, 0.2, 0.4);
  }

  /** Дуга Техніка: короткий електричний тріск. */
  arc(): void {
    this.burst('highpass', 6000, 2500, 1, 0.06, 0.16);
    this.tone('square', 1800, 600, 0.05, 0.05);
  }

  /** Активація здібності: 0 Штурмовик, 1 Інженер, 2 Медик, 3 Технік. */
  ability(cls: number): void {
    switch (cls) {
      case 0:
        this.tone('sawtooth', 200, 900, 0.35, 0.18);
        break;
      case 1:
        this.tone('triangle', 300, 600, 0.25, 0.2);
        this.burst('bandpass', 800, 2400, 2, 0.3, 0.12);
        break;
      case 2:
        [523, 659, 784].forEach((f, i) =>
          setTimeout(() => this.tone('sine', f, f, 0.25, 0.14), i * 70),
        );
        break;
      case 3:
        this.tone('sine', 1200, 60, 0.5, 0.35);
        this.burst('lowpass', 4000, 100, 1, 0.45, 0.35);
        break;
    }
  }

  explosion(pan: number): void {
    this.tone('sine', 120, 30, 0.6, 0.7, pan);
    this.burst('lowpass', 3000, 80, 0.7, 0.7, 0.7, pan);
  }

  rocketLaunch(pan: number): void {
    this.burst('bandpass', 400, 1600, 1, 0.5, 0.25, pan);
  }

  weakHit(pan: number): void {
    this.tone('square', 1200, 600, 0.08, 0.12, pan);
    this.burst('bandpass', 3000, 1200, 2, 0.06, 0.25, pan);
  }

  spiderJump(pan: number): void {
    this.tone('sawtooth', 900, 300, 0.25, 0.1, pan);
  }

  shieldUp(pan: number): void {
    this.tone('sine', 400, 900, 0.3, 0.12, pan);
  }

  ricochet(pan: number): void {
    this.tone('triangle', 2400, 1800, 0.08, 0.1, pan);
  }

  /** Камікадзе зводиться: висхідний вереск — «зараз пікірую». */
  kamikazeArm(pan: number): void {
    this.tone('sawtooth', 500, 1600, 0.55, 0.1, pan);
  }

  sniperCharge(pan: number): void {
    this.tone('sine', 300, 1200, 1.9, 0.06, pan);
  }

  sniperShot(pan: number): void {
    this.tone('square', 1400, 200, 0.2, 0.2, pan);
    this.burst('highpass', 5000, 2000, 1, 0.15, 0.3, pan);
  }

  revive(): void {
    [392, 523, 659, 784].forEach((f, i) =>
      setTimeout(() => this.tone('triangle', f, f, 0.2, 0.16), i * 80),
    );
  }

  reviveStart(): void {
    this.tone('sine', 300, 600, 0.3, 0.08);
  }

  purchase(ok: boolean): void {
    if (ok)
      [660, 990].forEach((f, i) =>
        setTimeout(() => this.tone('triangle', f, f, 0.12, 0.15), i * 60),
      );
    else this.tone('square', 180, 140, 0.12, 0.08);
  }

  overheat(): void {
    this.burst('highpass', 3000, 6000, 0.5, 0.6, 0.12);
  }

  barrierHit(): void {
    this.tone('triangle', 700, 500, 0.08, 0.1);
  }

  barrierBreak(): void {
    this.burst('bandpass', 3000, 400, 1.5, 0.4, 0.3);
  }

  /** Сигнал станції перед хвилею: дві низькі ноти сирени. */
  stationSignal(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    for (let i = 0; i < 2; i++) {
      const t = ctx.currentTime + i * 0.45;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(220, t);
      o.frequency.linearRampToValueAtTime(330, t + 0.35);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1200;
      const g = ctx.createGain();
      this.env(g, t, 0.18, 0.05, 0.38);
      o.connect(f).connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 0.5);
    }
  }

  fanfare(won: boolean): void {
    const notes = won ? [523, 659, 784, 1047] : [392, 330, 262, 196];
    notes.forEach((f, i) => setTimeout(() => this.tone('triangle', f, f, 0.28, 0.2), i * 140));
  }

  playerDown(): void {
    this.tone('sawtooth', 300, 40, 0.9, 0.3);
  }

  pickup(pan: number, combo: number): void {
    const f = 880 * Math.pow(2, Math.min(combo, 12) / 12);
    this.tone('triangle', f, f * 1.5, 0.09, 0.15, pan);
  }
}
