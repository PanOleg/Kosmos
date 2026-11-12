import {
  abilityReadiness,
  shopOpen,
  upgradePrice,
  TICKS_PER_SEC,
  UPGRADES,
  REVIVE,
  downedAllyNear,
  reviveCost,
  wholeParts,
  type ClassId,
  type Player,
  type ReviveInfo,
  type Game,
  type PlayerInput,
} from '@horizon/sim';
import {
  PING_PACKET_SIZE,
  PKT_INPUT,
  PKT_PING,
  PKT_PONG,
  PROTOCOL_VERSION,
  decodeInput,
  emptyInput,
  encodePing,
  seqNewer,
  type ControllerMessage,
  type AudioPrefs,
  type DroppedInfo,
  type MatchSummary,
  type LobbySlotInfo,
  type PauseInfo,
  type ScreenPhase,
  type ScreenMessage,
} from '@horizon/sim/protocol';
import type { Link } from './transport';

export const MAX_SLOTS = 4;
export const CLASS_IDS: ClassId[] = ['assault', 'engineer', 'medic', 'tech'];

export interface Slot {
  index: number;
  kind: 'phone' | 'keyboard' | 'bot';
  token: string;
  classId: ClassId | null;
  ready: boolean;
  link: Link | null;
  input: PlayerInput;
  lastSeq: number;
  /** Мілісекунди; NaN — ще не виміряно. */
  rtt: number;
  /** Час розриву, мс; null — на зв'язку. */
  lostAt: number | null;
  /** Гравці вирішили продовжити без нього: бот веде одразу, без 5 с очікування. */
  forceBot: boolean;
  /** Забарвлення броні — косметика з мета-прогресу. */
  skin: string;
}

const PING_EVERY = 1000;
const STATUS_EVERY = 100;
/** Незмінний статус повторюється не частіше ніж раз на стільки мс. */
const STATUS_HEARTBEAT = 1000;
/** Через стільки після розриву гравця в матчі веде бот (DECISIONS.md, п. 15). */
export const BOT_TAKEOVER_MS = 5000;
const LOBBY_DROP_MS = 20000;
/** Відлік після паузи: встигнути взяти телефон у руки (DECISIONS.md, п. 42). */
export const RESUME_MS = 3000;
/** PauseInfo.by: паузу поставив екран (клавіатура) / сама гра, бо чекає відключеного. */
export const PAUSE_BY_SCREEN = -1;
export const PAUSE_BY_AUTO = -2;

/**
 * Лобі й зв'язок з пультами без DOM: слоти, токени повернення, унікальні класи, пінг, статус.
 * Годинник і генератор токенів інжектуються — для тестів.
 */
export class LobbyHost {
  readonly slots: (Slot | null)[] = [null, null, null, null];
  phase: ScreenPhase = 'lobby';
  /** Пауза матчу; null — гра йде (можливо, ще триває відлік resumeAt). */
  pause: PauseInfo | null = null;
  /** Коли закінчиться відлік після паузи, мс; null — відліку немає. */
  private resumeAt: number | null = null;
  private game: Game | null = null;
  private lastPing = 0;
  private lastStatus = 0;
  private readonly statusSent = new WeakMap<Link, { body: string; at: number }>();
  private pingId = 1;
  private readonly pingSent = new Map<number, number>();
  private readonly buf = new DataView(new ArrayBuffer(PING_PACKET_SIZE));
  private dirty = true;
  /** Викликається при будь-якій зміні лобі (для перемальовки UI). */
  onChange: () => void = () => {};
  /** Відкриті забарвлення (мета-прогрес); перше — стандартне. */
  skins: string[] = ['standard'];
  /** Стан звуку для пультів; змінює екран (main.ts). */
  audio: AudioPrefs = { music: true, sfx: true, voice: true };
  /** Пульт перемкнув канал звуку. */
  onAudio: (what: keyof AudioPrefs) => void = () => {};
  /** Пульт на екрані результатів натиснув «Ще раз». */
  onAgain: () => void = () => {};
  /** Гравець покликав напарників («Сюди!»): індекс гравця в матчі. */
  onPing: (slot: number) => void = () => {};
  private readonly pingAt = new Map<Slot, number>();
  /** Подія для журналу діагностики (main.ts): хто прийшов, кому відмовили, хто зник. */
  log: (text: string) => void = () => {};
  /** Пульт надіслав рядки свого журналу. */
  onLog: (slot: number, lines: unknown) => void = () => {};
  /** Підсумок останнього матчу: пульт, що перепідключився на екрані результатів, теж його отримає. */
  private summary: MatchSummary | null = null;

  constructor(
    private readonly now: () => number,
    private readonly newToken: () => string,
  ) {}

  /** Нове з'єднання від пульта: чекаємо hello. */
  attach(link: Link): void {
    link.onReliable = (m) => this.onMessage(link, m);
    link.onUnreliable = (v) => this.onPacket(link, v);
    link.onClose = () => {
      const s = this.slotOf(link);
      if (!s) return;
      s.link = null;
      s.lostAt = this.now();
      this.log(`P${s.index + 1}: зв'язок із пультом утрачено (фаза ${this.phase})`);
      s.input = emptyInput();
      this.markDirty();
    };
  }

  private slotOf(link: Link): Slot | null {
    for (const s of this.slots) if (s && s.link === link) return s;
    return null;
  }

  private markDirty(): void {
    this.dirty = true;
    this.onChange();
  }

  private onMessage(link: Link, m: ControllerMessage): void {
    if (m.t === 'hello') {
      if (m.v !== PROTOCOL_VERSION) {
        link.sendReliable({ t: 'full', reason: 'version' });
        this.log(`відмова пульту: версія протоколу ${String(m.v)}, потрібна ${PROTOCOL_VERSION}`);
        return;
      }
      // Повернення в свій слот за токеном: клас, колір, деталі й стан лишаються.
      let slot = this.slots.find((s) => s && s.kind === 'phone' && s.token === m.token) ?? null;
      if (slot) {
        this.log(
          `P${slot.index + 1}: пульт повернувся у свій слот${slot.link ? ' (стара лінія ще була відкрита)' : ''}`,
        );
        slot.link?.close();
      } else {
        if (this.phase !== 'lobby') {
          link.sendReliable({ t: 'full', reason: 'inMatch' });
          this.log(`відмова пульту: матч уже йде, а токен ${m.token ? 'не знайдено' : 'порожній'}`);
          return;
        }
        let free = this.slots.findIndex((s) => s === null);
        if (free < 0) free = this.evictForNewcomer();
        if (free < 0) {
          link.sendReliable({ t: 'full', reason: 'full' });
          this.log('відмова пульту: усі чотири місця зайняті');
          return;
        }
        slot = this.createSlot(free, 'phone', m.token || this.newToken());
        this.log(`P${slot.index + 1}: новий пульт, клас ${slot.classId ?? '—'}`);
      }
      slot.link = link;
      slot.lostAt = null;
      // Оновлена сторінка пульта рахує пакети вводу знову з нуля: без скидання всі вони
      // здавалися б «старішими за прийнятий» і керування мовчки не працювало б.
      slot.lastSeq = -1;
      slot.input = emptyInput();
      slot.forceBot = false;
      this.unwait(slot.index);
      link.sendReliable({ t: 'welcome', slot: slot.index, token: slot.token });
      if (this.phase === 'results' && this.summary)
        link.sendReliable({ t: 'results', summary: this.summary, slot: slot.index });
      this.markDirty();
      return;
    }
    const s = this.slotOf(link);
    if (!s) return;
    if (m.t === 'log') {
      this.onLog(s.index, m.lines);
      return;
    }
    if (m.t === 'pause') {
      if (m.on) this.requestPause(s.index);
      else this.resume();
      return;
    }
    if (m.t === 'wait') {
      this.waitFor(m.slot);
      return;
    }
    if (m.t === 'audio') {
      if (m.what === 'music' || m.what === 'sfx' || m.what === 'voice') this.onAudio(m.what);
      return;
    }
    if (m.t === 'ping') {
      // Не частіше ніж раз на 2 с: мітка — сигнал, а не спам.
      const now = this.now();
      if (this.phase === 'match' && now - (this.pingAt.get(s) ?? -Infinity) >= 2000) {
        this.pingAt.set(s, now);
        this.onPing(s.index);
        // Решта пультів дізнається вібрацією й написом: на екран у бою дивляться не всі.
        for (const o of this.slots)
          if (o && o !== s) o.link?.sendReliable({ t: 'pinged', slot: s.index });
      }
      return;
    }
    if (m.t === 'again') {
      if (this.phase === 'results') this.onAgain();
      return;
    }
    if (this.phase !== 'lobby') return;
    if (m.t === 'skin') this.cycleSkin(s);
    else if (m.t === 'class') {
      // Вхід із мережі: приймаємо лише відомий клас або null.
      const c = m.classId === null || CLASS_IDS.includes(m.classId) ? m.classId : undefined;
      if (c === undefined || !this.pickClass(s, c, true))
        this.log(`P${s.index + 1}: клас ${String(m.classId)} не видано — зайнятий або невідомий`);
    } else if (m.t === 'ready') {
      s.ready = m.ready && s.classId !== null;
      this.markDirty();
    }
  }

  private onPacket(link: Link, v: DataView): void {
    const s = this.slotOf(link);
    if (!s || v.byteLength < 1) return;
    const type = v.getUint8(0);
    if (type === PKT_INPUT) {
      // Пакети невпорядковані: старіший за прийнятий відкидаємо.
      const seq = v.getUint16(1);
      if (s.lastSeq >= 0 && !seqNewer(seq, s.lastSeq)) return;
      if (s.lastSeq < 0) this.log(`P${s.index + 1}: пішов ввід із пульта (пакет ${seq})`);
      s.lastSeq = decodeInput(v, s.input);
    } else if (type === PKT_PING) {
      // Пульт міряє свою затримку: відповідаємо тим самим id.
      encodePing(this.buf, PKT_PONG, v.getUint32(1));
      link.sendUnreliable(this.buf.buffer.slice(0) as ArrayBuffer);
    } else if (type === PKT_PONG) {
      const sent = this.pingSent.get(v.getUint32(1));
      if (sent !== undefined) {
        const rtt = this.now() - sent;
        // Згладжування, щоб цифра в налагодженні не стрибала.
        s.rtt = Number.isNaN(s.rtt) ? rtt : s.rtt * 0.8 + rtt * 0.2;
      }
    }
  }

  private createSlot(index: number, kind: Slot['kind'], token: string): Slot {
    const s: Slot = {
      index,
      kind,
      token,
      classId: null,
      ready: kind !== 'phone',
      link: null,
      input: emptyInput(),
      lastSeq: -1,
      rtt: NaN,
      lostAt: null,
      forceBot: false,
      skin: 'standard',
    };
    this.slots[index] = s;
    // Перший вільний клас одразу, щоб можна було просто натиснути «готовий».
    this.pickClass(s, this.freeClasses()[0] ?? null);
    return s;
  }

  freeClasses(except?: Slot): ClassId[] {
    return CLASS_IDS.filter((c) => !this.slots.some((s) => s && s !== except && s.classId === c));
  }

  /**
   * Класи унікальні (DECISIONS.md, п. 22): зайнятий іншим — відмова. null знімає роль.
   * takeover — гравець із пультом важливіший за бота й за пульт без зв'язку: у лобі він
   * забирає їхній клас, а вони отримують його попередній (або перший вільний).
   */
  pickClass(s: Slot, classId: ClassId | null, takeover = false): boolean {
    const holder =
      classId === null
        ? null
        : (this.slots.find((o) => o && o !== s && o.classId === classId) ?? null);
    if (holder) {
      const weak = holder.kind === 'bot' || (holder.kind === 'phone' && holder.link === null);
      if (!takeover || !weak || this.phase !== 'lobby') return false;
      const prev = s.classId;
      s.classId = classId;
      holder.classId = prev ?? this.freeClasses(holder)[0] ?? null;
      if (holder.kind === 'phone') holder.ready = false;
      this.log(`P${s.index + 1} забрав клас ${String(classId)} у P${holder.index + 1}`);
      this.markDirty();
      return true;
    }
    s.classId = classId;
    if (classId === null) s.ready = false;
    this.markDirty();
    return true;
  }

  /**
   * Лобі повне, а прийшов живий гравець: звільняємо місце пульта без зв'язку (того, що зник
   * найдавніше), а якщо таких немає — бота. Живих гравців і клавіатуру не чіпаємо.
   */
  private evictForNewcomer(): number {
    const dead = this.slots
      .filter((s): s is Slot => s !== null && s.kind === 'phone' && s.link === null)
      .sort((a, b) => (a.lostAt ?? 0) - (b.lostAt ?? 0))[0];
    const victim = dead ?? this.slots.find((s): s is Slot => s !== null && s.kind === 'bot');
    if (!victim) return -1;
    this.log(
      `P${victim.index + 1}: місце звільнено для нового гравця (${victim.kind === 'bot' ? 'бот' : "пульт без зв'язку"})`,
    );
    const i = victim.index;
    this.slots[i] = null;
    return i;
  }

  addLocal(kind: 'keyboard' | 'bot'): Slot | null {
    if (this.phase !== 'lobby') return null;
    const free = this.slots.findIndex((s) => s === null);
    if (free < 0) return null;
    return this.createSlot(free, kind, '');
  }

  remove(index: number): void {
    const s = this.slots[index];
    if (!s) return;
    s.link?.close();
    this.slots[index] = null;
    this.markDirty();
  }

  /** Наступне відкрите забарвлення по колу. */
  cycleSkin(s: Slot): void {
    const i = this.skins.indexOf(s.skin);
    s.skin = this.skins[(i + 1) % this.skins.length] ?? 'standard';
    this.markDirty();
  }

  /** Нові відкриття після матчу: розсилка лобі з оновленим списком. */
  setSkins(skins: string[]): void {
    this.skins = skins;
    for (const s of this.slots) if (s && !skins.includes(s.skin)) s.skin = 'standard';
    this.markDirty();
  }

  cycleClass(s: Slot, dir: 1 | -1): void {
    const free = this.freeClasses(s);
    if (free.length === 0) return;
    const i = s.classId ? CLASS_IDS.indexOf(s.classId) : -1;
    for (let k = 1; k <= CLASS_IDS.length; k++) {
      const c = CLASS_IDS[(i + dir * k + CLASS_IDS.length * 4) % CLASS_IDS.length]!;
      if (free.includes(c)) {
        this.pickClass(s, c);
        return;
      }
    }
  }

  /** Усі присутні гравці готові, і є хоч один. Телефон без зв'язку старт не блокує. */
  canStart(): boolean {
    const taken = this.slots.filter(
      (s): s is Slot => s !== null && (s.kind !== 'phone' || s.link !== null),
    );
    return taken.length > 0 && taken.every((s) => s.ready && s.classId !== null);
  }

  /** Матч стартує зі стиснутими слотами: гравець i у грі — i-й зайнятий слот лобі. */
  beginMatch(game: Game, order: Slot[]): void {
    this.game = game;
    this.phase = 'match';
    order.forEach((s, i) => (s.index = i));
    this.log(
      `матч почато: ${order.map((s) => `P${s.index + 1} ${s.kind} ${String(s.classId)}`).join(', ')}`,
    );
    for (let i = 0; i < MAX_SLOTS; i++) this.slots[i] = order[i] ?? null;
    this.markDirty();
  }

  /** Кінець матчу: кожен пульт отримує підсумок і свій номер у ньому. */
  endMatch(summary?: MatchSummary): void {
    this.summary = summary ?? null;
    if (summary)
      for (const s of this.slots) s?.link?.sendReliable({ t: 'results', summary, slot: s.index });
    this.phase = 'results';
    this.log('матч завершено');
    this.clearPause();
    this.markDirty();
  }

  backToLobby(): void {
    this.phase = 'lobby';
    this.summary = null;
    this.game = null;
    this.clearPause();
    for (const s of this.slots) if (s && s.kind === 'phone') s.ready = false;
    this.markDirty();
  }

  lobbyInfo(): LobbySlotInfo[] {
    return this.slots
      .filter((s): s is Slot => s !== null)
      .map((s) => ({
        slot: s.index,
        classId: s.classId,
        ready: s.ready,
        connected: s.kind !== 'phone' || s.link !== null,
        kind: s.kind,
        skin: s.skin,
      }));
  }

  /** Результат покупки — пульт відповідає вібрацією й звуком. */
  bought(slot: number, item: number, ok: boolean): void {
    this.slots[slot]?.link?.sendReliable({ t: 'bought', item, ok });
    // Статус одразу, щоб кнопки оновили ціни без очікування наступного циклу.
    this.lastStatus = 0;
  }

  /** Гравцю в цьому слоті боляче: пульт вібрує й блимає. */
  hurt(slot: number, amount: number): void {
    this.slots[slot]?.link?.sendReliable({ t: 'hurt', amount });
  }

  // ---------- Пауза й відключення (DECISIONS.md, п. 9, 15, 42) ----------

  /** Симуляція крокує: матч, не пауза й не відлік до продовження. */
  running(): boolean {
    if (this.phase !== 'match' || this.pause) return false;
    if (this.resumeAt !== null && this.now() < this.resumeAt) return false;
    this.resumeAt = null;
    return true;
  }

  /** Секунди відліку до продовження; 0 — відліку немає. */
  resumeIn(): number {
    if (this.pause || this.resumeAt === null) return 0;
    return Math.max(0, Math.ceil((this.resumeAt - this.now()) / 1000));
  }

  /** Пауза з пульта (by — слот) чи екрана. Під час відліку — повернення в паузу. */
  requestPause(by: number): void {
    if (this.phase !== 'match') return;
    this.resumeAt = null;
    if (this.pause) this.pause.by = by;
    else this.pause = { by, waiting: [] };
    this.statusSoon();
  }

  /** Продовжити: тих, на кого чекали, а їх досі немає, веде бот — одразу. */
  resume(): void {
    if (!this.pause) return;
    for (const i of this.pause.waiting) {
      const s = this.slots[i];
      if (s && s.lostAt !== null) s.forceBot = true;
    }
    this.pause = null;
    this.resumeAt = this.now() + RESUME_MS;
    this.statusSoon();
  }

  togglePause(by: number): void {
    if (this.pause) this.resume();
    else this.requestPause(by);
  }

  /** Чекати відключеного гравця на паузі замість бота. */
  waitFor(slot: number, by = PAUSE_BY_AUTO): void {
    const s = this.slots[slot];
    if (this.phase !== 'match' || !s || s.kind !== 'phone' || s.lostAt === null) return;
    s.forceBot = false;
    if (!this.pause) {
      this.resumeAt = null;
      this.pause = { by, waiting: [] };
    }
    if (!this.pause.waiting.includes(slot)) this.pause.waiting.push(slot);
    this.statusSoon();
  }

  /** Гравець повернувся: якщо пауза була лише через очікування — продовжуємо з відліком. */
  private unwait(slot: number): void {
    const p = this.pause;
    if (!p) return;
    const i = p.waiting.indexOf(slot);
    if (i < 0) return;
    p.waiting.splice(i, 1);
    if (p.waiting.length === 0 && p.by === PAUSE_BY_AUTO) this.resume();
    else this.statusSoon();
  }

  private clearPause(): void {
    this.pause = null;
    this.resumeAt = null;
  }

  /** Хтось із людей ще тримає керування: клавіатура або пульт на зв'язку. */
  private humanPresent(): boolean {
    return this.slots.some((s) => s && (s.kind === 'keyboard' || (s.kind === 'phone' && s.link)));
  }

  /** Відключені, яких не чекаємо: бот уже веде або поведе за botIn секунд. */
  dropped(): DroppedInfo[] {
    const out: DroppedInfo[] = [];
    if (this.phase !== 'match') return out;
    const t = this.now();
    for (const s of this.slots) {
      if (!s || s.kind !== 'phone' || s.lostAt === null) continue;
      if (this.pause?.waiting.includes(s.index)) continue;
      const left = s.forceBot ? 0 : BOT_TAKEOVER_MS - (t - s.lostAt);
      out.push({ slot: s.index, botIn: Math.max(0, Math.ceil(left / 1000)) });
    }
    return out;
  }

  private statusSoon(): void {
    this.lastStatus = -Infinity;
    this.onChange();
  }

  /** Раз на кадр: пінги, статус, розсилка лобі при змінах. */
  update(): void {
    const t = this.now();
    // Усі люди без зв'язку: бот не має за кого грати «за вибором інших» — чекаємо на паузі.
    if (this.phase === 'match' && !this.humanPresent())
      for (const s of this.slots)
        if (s && s.kind === 'phone' && s.lostAt !== null && !this.pause?.waiting.includes(s.index))
          this.waitFor(s.index);
    // У лобі телефон, що зник надовго, звільняє місце й клас.
    if (this.phase === 'lobby')
      for (const s of this.slots)
        if (s && s.kind === 'phone' && s.lostAt !== null && t - s.lostAt > LOBBY_DROP_MS)
          this.remove(s.index);
    if (this.dirty) {
      this.dirty = false;
      const msg = {
        t: 'lobby' as const,
        phase: this.phase,
        slots: this.lobbyInfo(),
        skins: this.skins,
      };
      for (const s of this.slots) s?.link?.sendReliable(msg);
    }
    if (t - this.lastPing >= PING_EVERY) {
      this.lastPing = t;
      const id = this.pingId++;
      this.pingSent.set(id, t);
      this.pingSent.delete(id - 10);
      encodePing(this.buf, PKT_PING, id);
      for (const s of this.slots) s?.link?.sendUnreliable(this.buf.buffer.slice(0) as ArrayBuffer);
    }
    if (t - this.lastStatus >= STATUS_EVERY) {
      this.lastStatus = t;
      const g = this.game;
      const dropped = this.dropped();
      for (const s of this.slots) {
        if (!s?.link) continue;
        const p = g?.state.players[s.index];
        const rv = p && g && !p.down ? reviveInfo(g, p) : null;
        const msg: ScreenMessage = {
          t: 'status',
          phase: this.phase,
          classId: s.classId,
          hp: p ? Math.ceil(p.hp) : 0,
          maxHp: p ? p.maxHp : 0,
          parts: p ? Math.floor(p.parts + 1e-6) : 0,
          down: p ? p.down : false,
          // Крок 0,05: кільце на пульті й так плавне, а повідомлень на порядок менше.
          ability: p && g ? Math.floor(abilityReadiness(g, p) * 20) / 20 : 1,
          wave: g ? g.state.wave.index : 0,
          shop:
            p && g && shopOpen(g)
              ? {
                  secondsLeft: Math.ceil(g.state.wave.timer / TICKS_PER_SEC),
                  levels: [p.upg.weapon, p.upg.armor, p.upg.ability],
                  prices: [
                    upgradePrice(p, 'weapon'),
                    upgradePrice(p, 'armor'),
                    upgradePrice(p, 'ability'),
                  ],
                  medkit: p.medkitBought ? null : UPGRADES.medkit.price,
                  life: g.state.players.length === 1 && !p.lifeBought ? REVIVE.soloLifePrice : null,
                }
              : null,
          revive: rv && { ...rv, progress: Math.round(rv.progress * 20) / 20 },
          bleed: p && p.down ? (p.out ? -1 : Math.ceil(p.bleedT / TICKS_PER_SEC)) : 0,
          pause: this.pause && { by: this.pause.by, waiting: [...this.pause.waiting] },
          resumeIn: this.resumeIn(),
          dropped,
          audio: this.audio,
        };
        // Трафік (п. 74): статус іде лише коли щось змінилось, і раз на секунду — для певності.
        // Раніше — 10 разів на секунду кожному пульту, здебільшого те саме.
        const body = JSON.stringify(msg);
        const last = this.statusSent.get(s.link);
        if (last && last.body === body && t - last.at < STATUS_HEARTBEAT) continue;
        this.statusSent.set(s.link, { body, at: t });
        s.link.sendReliable(msg);
      }
    }
  }

  /** Гравець відключений довше за поріг — у матчі його веде бот. */
  botControlled(s: Slot): boolean {
    return (
      s.kind === 'bot' ||
      (s.kind === 'phone' &&
        s.lostAt !== null &&
        // Того, на кого чекаємо на паузі, бот не веде.
        !this.pause?.waiting.includes(s.index) &&
        (s.forceBot || this.now() - s.lostAt > BOT_TAKEOVER_MS))
    );
  }
}

function reviveInfo(g: Game, p: Player): ReviveInfo | null {
  if (downedAllyNear(g, p) < 0) return null;
  const cost = reviveCost(g, p);
  return {
    cost,
    affordable: wholeParts(p) >= cost,
    progress: p.reviveT / (REVIVE.hold * TICKS_PER_SEC),
  };
}
