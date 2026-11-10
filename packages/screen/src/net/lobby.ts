import {
  abilityReadiness,
  shopOpen,
  upgradePrice,
  TICKS_PER_SEC,
  UPGRADES,
  type ClassId,
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
  type LobbySlotInfo,
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
}

const PING_EVERY = 1000;
const STATUS_EVERY = 100;
/** Через стільки після розриву гравця в матчі веде бот (DECISIONS.md, п. 15). */
export const BOT_TAKEOVER_MS = 5000;
const LOBBY_DROP_MS = 20000;

/**
 * Лобі й зв'язок з пультами без DOM: слоти, токени повернення, унікальні класи, пінг, статус.
 * Годинник і генератор токенів інжектуються — для тестів.
 */
export class LobbyHost {
  readonly slots: (Slot | null)[] = [null, null, null, null];
  phase: ScreenPhase = 'lobby';
  private game: Game | null = null;
  private lastPing = 0;
  private lastStatus = 0;
  private pingId = 1;
  private readonly pingSent = new Map<number, number>();
  private readonly buf = new DataView(new ArrayBuffer(PING_PACKET_SIZE));
  private dirty = true;
  /** Викликається при будь-якій зміні лобі (для перемальовки UI). */
  onChange: () => void = () => {};

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
      link.sendReliable({ t: 'welcome', slot: slot.index, token: slot.token });
      this.markDirty();
      return;
    }
    const s = this.slotOf(link);
    if (!s || this.phase !== 'lobby') return;
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

  endMatch(): void {
    this.phase = 'results';
    this.markDirty();
  }

  backToLobby(): void {
    this.phase = 'lobby';
    this.game = null;
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

  /** Раз на кадр: пінги, статус, розсилка лобі при змінах. */
  update(): void {
    const t = this.now();
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
                }
              : null,
        });
      }
    }
  }

  /** Гравець відключений довше за поріг — у матчі його веде бот. */
  botControlled(s: Slot): boolean {
    return (
      s.kind === 'bot' ||
      (s.kind === 'phone' && s.lostAt !== null && this.now() - s.lostAt > BOT_TAKEOVER_MS)
    );
  }
}
