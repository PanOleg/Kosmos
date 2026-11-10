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
  type DroppedInfo,
  type MatchSummary,
  type LobbySlotInfo,
  type PauseInfo,
  type ScreenPhase,
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
}

const PING_EVERY = 1000;
const STATUS_EVERY = 100;
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
  private pingId = 1;
  private readonly pingSent = new Map<number, number>();
  private readonly buf = new DataView(new ArrayBuffer(PING_PACKET_SIZE));
  private dirty = true;
  /** Викликається при будь-якій зміні лобі (для перемальовки UI). */
  onChange: () => void = () => {};
  /** Пульт на екрані результатів натиснув «Ще раз». */
  onAgain: () => void = () => {};
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
        return;
      }
      // Повернення в свій слот за токеном: клас, колір, деталі й стан лишаються.
      let slot = this.slots.find((s) => s && s.kind === 'phone' && s.token === m.token) ?? null;
      if (slot) {
        slot.link?.close();
      } else {
        if (this.phase !== 'lobby') {
          link.sendReliable({ t: 'full', reason: 'inMatch' });
          return;
        }
        const free = this.slots.findIndex((s) => s === null);
        if (free < 0) {
          link.sendReliable({ t: 'full', reason: 'full' });
          return;
        }
        slot = this.createSlot(free, 'phone', m.token || this.newToken());
      }
      slot.link = link;
      slot.lostAt = null;
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
    if (m.t === 'pause') {
      if (m.on) this.requestPause(s.index);
      else this.resume();
      return;
    }
    if (m.t === 'wait') {
      this.waitFor(m.slot);
      return;
    }
    if (m.t === 'again') {
      if (this.phase === 'results') this.onAgain();
      return;
    }
    if (this.phase !== 'lobby') return;
    if (m.t === 'class') this.pickClass(s, m.classId);
    else if (m.t === 'ready') {
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
    };
    this.slots[index] = s;
    // Перший вільний клас одразу, щоб можна було просто натиснути «готовий».
    this.pickClass(s, this.freeClasses()[0] ?? null);
    return s;
  }

  freeClasses(except?: Slot): ClassId[] {
    return CLASS_IDS.filter((c) => !this.slots.some((s) => s && s !== except && s.classId === c));
  }

  /** Класи унікальні (DECISIONS.md, п. 22): зайнятий іншим — відмова. */
  pickClass(s: Slot, classId: ClassId | null): boolean {
    if (classId !== null && !this.freeClasses(s).includes(classId)) return false;
    s.classId = classId;
    if (classId === null) s.ready = false;
    this.markDirty();
    return true;
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
    for (let i = 0; i < MAX_SLOTS; i++) this.slots[i] = order[i] ?? null;
    this.markDirty();
  }

  /** Кінець матчу: кожен пульт отримує підсумок і свій номер у ньому. */
  endMatch(summary?: MatchSummary): void {
    this.summary = summary ?? null;
    if (summary)
      for (const s of this.slots) s?.link?.sendReliable({ t: 'results', summary, slot: s.index });
    this.phase = 'results';
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
      const msg = { t: 'lobby' as const, phase: this.phase, slots: this.lobbyInfo() };
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
        s.link.sendReliable({
          t: 'status',
          phase: this.phase,
          classId: s.classId,
          hp: p ? Math.ceil(p.hp) : 0,
          maxHp: p ? p.maxHp : 0,
          parts: p ? Math.floor(p.parts + 1e-6) : 0,
          down: p ? p.down : false,
          ability: p && g ? abilityReadiness(g, p) : 1,
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
          revive: p && g && !p.down ? reviveInfo(g, p) : null,
          bleed: p && p.down ? (p.out ? -1 : Math.ceil(p.bleedT / TICKS_PER_SEC)) : 0,
          pause: this.pause && { by: this.pause.by, waiting: [...this.pause.waiting] },
          resumeIn: this.resumeIn(),
          dropped,
        });
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
