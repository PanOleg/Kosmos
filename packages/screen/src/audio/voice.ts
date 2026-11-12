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

/** Фраза, що звучить або ось-ось зазвучить (src ще немає, поки файл вантажиться). */
interface Playing {
  src: AudioBufferSourceNode | null;
  prio: number;
}

export class Voice {
  private buffers = new Map<string, AudioBuffer | Promise<AudioBuffer | null>>();
  private theme: VoiceTheme = 'station';
  private playing: Playing | null = null;
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
   * Фрази ніколи не звучать одночасно (п. 79): «зайнято» стає одразу, ще до завантаження
   * файла, — раніше дві фрази, сказані в один кадр, могли накластися одна на одну.
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
        // Рівні за важливістю лишаються в порядку надходження.
        this.queue.push({ id, prio });
        this.queue.sort((x, y) => y.prio - x.prio);
        this.queue.length = Math.min(this.queue.length, 2);
        return;
      }
    }
    this.start(id, prio);
  }

  stop(): void {
    const p = this.playing;
    this.playing = null;
    try {
      p?.src?.stop();
    } catch {
      /* уже зупинено */
    }
    this.onSpeaking(false);
  }

  /** Наступна з черги після короткої паузи, щоб фрази не зливалися. */
  private next(me: Playing): void {
    if (this.playing !== me) return;
    const n = this.queue.shift();
    if (!n) {
      this.playing = null;
      this.onSpeaking(false);
      return;
    }
    const gap: Playing = { src: null, prio: n.prio };
    this.playing = gap;
    window.setTimeout(() => {
      if (this.playing === gap) this.start(n.id, n.prio);
    }, 280);
  }

  private start(id: string, prio: number): void {
    const a = this.getAudio();
    if (!a) return;
    const me: Playing = { src: null, prio };
    this.playing = me;
    this.onSpeaking(true);
    void this.load(a.ctx, id).then((buf) => {
      if (this.playing !== me) return;
      if (!buf) {
        if (VOICE_FALLBACK[id]) this.start(VOICE_FALLBACK[id]!, prio);
        else this.next(me);
        return;
      }
      if (!this.enabled) {
        this.stop();
        return;
      }
      const ctx = a.ctx;
      const input = this.chain(ctx, a.out);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(input);
      // Музика й звуки встигають стихнути до першого слова.
      const t = ctx.currentTime + 0.12;
      if (this.theme === 'desert') {
        this.squelch(ctx, input, t - 0.06);
        this.squelch(ctx, input, t + buf.duration);
      }
      src.start(t);
      me.src = src;
      src.onended = () => this.next(me);
    });
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

  /** Обробка голосу під карту; будується раз на тему й контекст. */
  private chain(ctx: AudioContext, out: AudioNode): AudioNode {
    if (this.chainIn && this.chainCtx === ctx) return this.chainIn;
    this.chainCtx = ctx;
    const desert = this.theme === 'desert';
    // Розбірливість понад «ефект» (п. 79): широка смуга, підйом приголосних біля 3 кГц,
    // ледь помітне перевантаження й компресор, що вирівнює гучність фраз. Характер карти
    // лишається: на станції — коротка тиха луна, надворі — трохи вужча смуга й шипіння рації.
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = desert ? 300 : 170;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = desert ? 5200 : 7500;
    const peak = ctx.createBiquadFilter();
    peak.type = 'peaking';
    peak.frequency.value = 3000;
    peak.Q.value = 0.9;
    peak.gain.value = 4;
    const shaper = ctx.createWaveShaper();
    const k = desert ? 1.6 : 0.8;
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    shaper.curve = curve;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    const g = ctx.createGain();
    g.gain.value = desert ? 1.0 : 1.05;
    hp.connect(lp).connect(peak).connect(shaper).connect(comp).connect(g).connect(out);
    if (!desert) {
      // Одне тихе відлуння металевого відсіку — без повторів, що змазують слова.
      const d = ctx.createDelay(0.5);
      d.delayTime.value = 0.09;
      const wet = ctx.createGain();
      wet.gain.value = 0.1;
      g.connect(d).connect(wet).connect(out);
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
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    src.connect(g).connect(into);
    src.start(t);
    src.stop(t + 0.15);
  }
}
