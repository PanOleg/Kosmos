/**
 * Генеративна музика пустелі (DECISIONS.md, п. 50) — синтез на Web Audio, без файлів.
 * Лад — фрігійський домінантовий (хіджаз) від ре: бурдон ре–ля, рамковий барабан і дарбука
 * («дум–тек»), щипкові фрази в ладі, що щоразу інші. Інтенсивність за станом гри: спокій
 * (лобі, паузи між хвилями) → бій → бос; пауза й результати — «з-за стіни» (низькочастотний фільтр).
 * Ноти плануються наперед (lookahead), тож темп не плаває разом із частотою кадрів.
 * Плюс фоновий вітер із поривами. На станції музики немає — лише звуки подій.
 */
export type MusicLevel = 'calm' | 'fight' | 'boss';

const BPM = 96;
const STEP = 60 / BPM / 4; // шістнадцяті
// Хіджаз від D3: D Eb F# G A Bb C (півтони від D).
const SCALE = [0, 1, 4, 5, 7, 8, 10];
const D3 = 146.83;
const freq = (deg: number, oct = 0) => {
  const n = SCALE.length;
  const o = Math.floor(deg / n) + oct;
  const s = SCALE[((deg % n) + n) % n]!;
  return D3 * Math.pow(2, o + s / 12);
};

// Ритм на 16 кроків: d — дум (низький), t — тек (дзвінкий), k — ка (тихий тек).
const DRUM: Record<MusicLevel, string> = {
  calm: 'd.......t.......',
  fight: 'd..t..d.t..k.t..',
  boss: 'd.kt.kd.t.ktd.kt',
};

export class Music {
  private ctx: AudioContext | null = null;
  private bus!: GainNode;
  private lp!: BiquadFilterNode;
  private noise!: AudioBuffer;
  private timer = 0;
  private nextT = 0;
  private step = 0;
  private bar = 0;
  private level: MusicLevel = 'calm';
  private on = false;
  private muffled = false;
  private droneNodes: { stop(): void } | null = null;
  private windNodes: { stop(): void } | null = null;
  private seed = 12345;
  /** Поточна фраза мелодії: ступені ладу на 16 кроків (null — пауза). */
  private phrase: (number | null)[] = [];

  /** Контекст і вихід беремо зі звуків подій: один AudioContext на сторінку. */
  constructor(private readonly getAudio: () => { ctx: AudioContext; out: AudioNode } | null) {}

  private rand(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  /** Вмикає пустелю (true) або вимикає музику (станція). Безпечно кликати до жесту — підхопиться пізніше. */
  setEnabled(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    if (!on) this.stopAll();
  }

  setLevel(level: MusicLevel): void {
    this.level = level;
  }

  /** Пауза й результати: музика стає глухою й тихішою. */
  setMuffled(m: boolean): void {
    if (m === this.muffled || !this.ctx) {
      this.muffled = m;
      return;
    }
    this.muffled = m;
    const t = this.ctx.currentTime;
    this.lp.frequency.setTargetAtTime(m ? 420 : 9000, t, 0.25);
    this.bus.gain.setTargetAtTime(m ? 0.1 : 0.22, t, 0.3);
  }

  /** Раз на кадр: запускає все, щойно з'явився аудіоконтекст (перший дотик). */
  tick(): void {
    if (!this.on || this.ctx) return;
    const a = this.getAudio();
    if (!a) return;
    const ctx = a.ctx;
    this.ctx = ctx;
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = this.muffled ? 420 : 9000;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.gain.setTargetAtTime(this.muffled ? 0.1 : 0.22, ctx.currentTime, 1.5);
    this.bus.connect(this.lp).connect(a.out);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.droneNodes = this.drone();
    this.windNodes = this.wind(a.out);
    this.nextT = ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  private stopAll(): void {
    window.clearInterval(this.timer);
    this.droneNodes?.stop();
    this.windNodes?.stop();
    this.droneNodes = this.windNodes = null;
    if (this.ctx) {
      this.bus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
      const bus = this.bus;
      setTimeout(() => bus.disconnect(), 1500);
    }
    this.ctx = null;
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    while (this.nextT < ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextT);
      this.nextT += STEP;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) this.bar++;
    }
  }

  private playStep(s: number, t: number): void {
    const lv = this.level;
    const ch = DRUM[lv][s];
    if (ch === 'd') this.doum(t, lv === 'boss' ? 0.55 : 0.45);
    else if (ch === 't') this.tek(t, 0.22);
    else if (ch === 'k') this.tek(t, 0.1);
    if (lv !== 'calm' && s % 2 === 1) this.shaker(t, lv === 'boss' ? 0.07 : 0.045);
    // Бас у бою: тоніка на сильні долі, квінта перед зміною такту.
    if (lv !== 'calm' && (s === 0 || s === 6 || s === 10))
      this.pluck(freq(s === 10 ? 4 : 0, -1), t, 0.2, 0.32, 'triangle');
    if (lv === 'boss' && s === 0 && this.bar % 2 === 0) this.horn(freq(0, -1), t, STEP * 14, 0.09);
    // Мелодія: нова фраза на початку кожних двох тактів; у спокої — через раз.
    if (s === 0 && this.bar % 2 === 0) this.newPhrase();
    const playBar = lv !== 'calm' || this.bar % 4 < 2;
    const deg = this.phrase[s];
    if (playBar && deg !== null && deg !== undefined) {
      const f = freq(deg, 1);
      this.pluck(f, t, 0.13, 0.55, 'sawtooth');
      // Тремоло-повтор, як на уді, на довгих нотах.
      if (this.phrase[s + 1] === null && this.rand() < 0.35)
        this.pluck(f, t + STEP / 2, 0.06, 0.3, 'sawtooth');
    }
  }

  /** Випадкова прогулянка ладом: короткі кроки, повернення до тоніки в кінці. */
  private newPhrase(): void {
    const density = this.level === 'calm' ? 0.35 : this.level === 'fight' ? 0.5 : 0.62;
    let deg = Math.floor(this.rand() * 5);
    const out: (number | null)[] = [];
    for (let i = 0; i < 16; i++) {
      if (i === 14) {
        out.push(0);
        continue;
      }
      if (this.rand() > density && i !== 0) {
        out.push(null);
        continue;
      }
      const r = this.rand();
      deg += r < 0.4 ? 1 : r < 0.8 ? -1 : r < 0.9 ? 2 : -2;
      deg = Math.max(-2, Math.min(9, deg));
      out.push(deg);
    }
    this.phrase = out;
  }

  // ---------- Голоси ----------

  private doum(t: number, peak: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(52, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.4);
  }

  private tek(t: number, peak: number): void {
    this.noiseHit(t, 'bandpass', 3200, 4, 0.07, peak);
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(820, t);
    o.frequency.exponentialRampToValueAtTime(600, t + 0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak * 0.5, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.1);
  }

  private shaker(t: number, peak: number): void {
    this.noiseHit(t, 'highpass', 6500, 0.7, 0.05, peak);
  }

  private noiseHit(
    t: number,
    type: BiquadFilterType,
    f: number,
    q: number,
    dur: number,
    peak: number,
  ) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const flt = ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.value = f;
    flt.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt).connect(g).connect(this.bus);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }

  /** Щипок: швидка атака, згасання, фільтр закривається — як струна уда. */
  private pluck(f: number, t: number, peak: number, dur: number, type: OscillatorType): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f * 1.012, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.Q.value = 3;
    flt.frequency.setValueAtTime(f * 7, t);
    flt.frequency.exponentialRampToValueAtTime(f * 1.5, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(flt).connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Низький тягучий духовий (бос): пила з вібрато крізь фільтр. */
  private horn(f: number, t: number, dur: number, peak: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const vib = ctx.createOscillator();
    vib.frequency.value = 5;
    const vg = ctx.createGain();
    vg.gain.value = f * 0.01;
    vib.connect(vg).connect(o.frequency);
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 700;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.3);
    g.gain.setValueAtTime(peak, t + dur - 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(flt).connect(g).connect(this.bus);
    o.start(t);
    vib.start(t);
    o.stop(t + dur + 0.05);
    vib.stop(t + dur + 0.05);
  }

  /** Бурдон: ре й ля, дві злегка розстроєні пили під повільним фільтром. */
  private drone(): { stop(): void } {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 380;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = ctx.createGain();
    lg.gain.value = 160;
    lfo.connect(lg).connect(flt.frequency);
    const g = ctx.createGain();
    g.gain.value = 0.06;
    flt.connect(g).connect(this.bus);
    const oscs = [D3 / 2, (D3 / 2) * 1.5, (D3 / 2) * 1.004].map((f) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(flt);
      o.start(t);
      return o;
    });
    lfo.start(t);
    return {
      stop: () => {
        const s = ctx.currentTime + 0.5;
        for (const o of oscs) o.stop(s);
        lfo.stop(s);
      },
    };
  }

  /** Вітер: шум крізь смуговий фільтр, частота й гучність повільно «дихають» поривами. */
  private wind(out: AudioNode): { stop(): void } {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const flt = ctx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.Q.value = 0.9;
    flt.frequency.value = 520;
    const fl = ctx.createOscillator();
    fl.frequency.value = 0.11;
    const fg = ctx.createGain();
    fg.gain.value = 280;
    fl.connect(fg).connect(flt.frequency);
    const g = ctx.createGain();
    g.gain.value = 0.05;
    const gl = ctx.createOscillator();
    gl.frequency.value = 0.07;
    const gg = ctx.createGain();
    gg.gain.value = 0.035;
    gl.connect(gg).connect(g.gain);
    src.connect(flt).connect(g).connect(out);
    src.start(t);
    fl.start(t);
    gl.start(t);
    return {
      stop: () => {
        g.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
        const s = ctx.currentTime + 1.5;
        src.stop(s);
        fl.stop(s);
        gl.stop(s);
      },
    };
  }
}
