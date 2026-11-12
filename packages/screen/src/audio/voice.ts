/**
 * Озвучка (DECISIONS.md, п. 52): заздалегідь згенеровані фрази (scripts/voice, голос macOS «Лесі»)
 * у public/voice/*.mp3 — однаково на будь-якому пристрої, навіть де немає українського синтезу.
 * Голос іде через обробку під карту: станція — гучномовець бортового комп'ютера (смуга, легке
 * перевантаження, коротка луна), пустеля — рація (вужча смуга й шипіння на початку й у кінці).
 * Черга з пріоритетами: фрази не накладаються, важливе перебиває дрібне, повтори глушаться.
 * Поки звучить голос, музика тихішає.
 */
export type VoiceTheme = 'station' | 'desert';

interface Queued {
  id: string;
  prio: number;
}

/**
 * Запасні фрази (п. 77): нові репліки карт і босів записуються окремо; поки запису немає,
 * звучить стара спільна.
 */
export const VOICE_FALLBACK: Record<string, string> = {
  startIce: 'startDesert',
  startForest: 'startDesert',
  victoryIce: 'victoryDesert',
  victoryForest: 'victoryDesert',
  wolf: 'foreman',
  sabretooth: 'foreman',
  scorpion: 'foreman',
  bear: 'core',
  yeti: 'core',
  sphinx: 'core',
  beastPhase2: 'phase2',
  beastPhase3: 'phase3',
};

export class Voice {
  private buffers = new Map<string, AudioBuffer | Promise<AudioBuffer | null>>();
  private theme: VoiceTheme = 'station';
  private playing: { src: AudioBufferSourceNode; prio: number } | null = null;
  private queue: Queued[] = [];
  private lastSaid = new Map<string, number>();
  private chainIn: AudioNode | null = null;
  private chainCtx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  enabled = true;
  /** Музика тихішає на час фрази. */
  onSpeaking: (on: boolean) => void = () => {};

  constructor(private readonly getAudio: () => { ctx: AudioContext; out: AudioNode } | null) {}

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      this.queue = [];
      this.stop();
    }
  }

  setTheme(theme: VoiceTheme): void {
    if (theme === this.theme) return;
    this.theme = theme;
    this.chainIn = null;
  }

  /**
   * Сказати фразу. prio: 1 — дрібне (піднявся), 2 — звичайне (хвиля), 3 — тривога (бос, шлюз).
   * Те саме не повторюється частіше ніж раз на 4 с; черга — не довша за дві фрази.
   */
  say(id: string, prio = 2): void {
    if (!this.enabled) return;
    // Фрази ще немає в записі — звучить запасна (стара спільна), а не тиша.
    while (this.missing.has(id) && VOICE_FALLBACK[id]) id = VOICE_FALLBACK[id]!;
    const a = this.getAudio();
    if (!a) return;
    const now = a.ctx.currentTime;
    if (now - (this.lastSaid.get(id) ?? -99) < 4) return;
    this.lastSaid.set(id, now);
    void this.load(a.ctx, id);
    if (this.playing) {
      if (prio > this.playing.prio) {
        this.queue = [];
        this.stop();
      } else {
        this.queue.push({ id, prio });
        this.queue.sort((x, y) => y.prio - x.prio);
        this.queue.length = Math.min(this.queue.length, 2);
        return;
      }
    }
    void this.play(id, prio);
  }

  stop(): void {
    const p = this.playing;
    this.playing = null;
    try {
      p?.src.stop();
    } catch {
      /* уже зупинено */
    }
    this.onSpeaking(false);
  }

  private readonly missing = new Set<string>();

  private load(ctx: AudioContext, id: string): Promise<AudioBuffer | null> {
    const have = this.buffers.get(id);
    if (have) return Promise.resolve(have);
    const p = fetch(`${import.meta.env.BASE_URL}voice/${id}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => ctx.decodeAudioData(b))
      .then((buf) => {
        this.buffers.set(id, buf);
        return buf;
      })
      .catch((e) => {
        console.warn('[voice]', id, e);
        this.buffers.delete(id);
        this.missing.add(id);
        return null;
      });
    this.buffers.set(id, p);
    return p;
  }

  private async play(id: string, prio: number): Promise<void> {
    const a = this.getAudio();
    if (!a) return;
    const buf = await this.load(a.ctx, id);
    if (!buf && VOICE_FALLBACK[id]) return this.play(VOICE_FALLBACK[id]!, prio);
    if (!buf || !this.enabled || (this.playing && this.playing.prio >= prio)) return;
    const ctx = a.ctx;
    const input = this.chain(ctx, a.out);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(input);
    const t = ctx.currentTime + 0.05;
    if (this.theme === 'desert') {
      this.squelch(ctx, input, t - 0.04);
      this.squelch(ctx, input, t + buf.duration);
    }
    src.start(t);
    const me = { src, prio };
    this.playing = me;
    this.onSpeaking(true);
    src.onended = () => {
      if (this.playing !== me) return;
      this.playing = null;
      const next = this.queue.shift();
      if (next) void this.play(next.id, next.prio);
      else this.onSpeaking(false);
    };
  }

  /** Обробка голосу під карту; будується раз на тему й контекст. */
  private chain(ctx: AudioContext, out: AudioNode): AudioNode {
    if (this.chainIn && this.chainCtx === ctx) return this.chainIn;
    this.chainCtx = ctx;
    const desert = this.theme === 'desert';
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = desert ? 450 : 260;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = desert ? 2900 : 4200;
    const peak = ctx.createBiquadFilter();
    peak.type = 'peaking';
    peak.frequency.value = desert ? 1600 : 1900;
    peak.gain.value = 5;
    // Легке перевантаження: «динамік», а не студія.
    const shaper = ctx.createWaveShaper();
    const k = desert ? 8 : 3;
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    shaper.curve = curve;
    const g = ctx.createGain();
    g.gain.value = desert ? 0.5 : 0.62;
    hp.connect(lp).connect(peak).connect(shaper).connect(g).connect(out);
    if (!desert) {
      // Коротка луна металевого відсіку.
      const d = ctx.createDelay(0.5);
      d.delayTime.value = 0.11;
      const fb = ctx.createGain();
      fb.gain.value = 0.22;
      g.connect(d).connect(fb).connect(d);
      fb.connect(out);
    }
    this.chainIn = hp;
    return hp;
  }

  /** Шипіння рації: короткий сплеск шуму на вході й виході фрази. */
  private squelch(ctx: AudioContext, into: AudioNode, t: number): void {
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, ctx.sampleRate / 2, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    src.connect(g).connect(into);
    src.start(t);
    src.stop(t + 0.15);
  }
}
