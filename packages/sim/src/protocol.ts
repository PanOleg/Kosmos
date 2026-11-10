import type { ClassId } from './config/balance';

export type { ClassId };

/** Ввід одного гравця за крок. Однаковий для клавіатури, бота й телефона: повний стан, не події. */
export interface PlayerInput {
  move: { x: number; y: number };
  ability: boolean;
  dash: boolean;
  /** Товар, який тримають натиснутим (1 зброя, 2 броня, 3 здібність, 4 аптечка; 0 — нічого). */
  buy: number;
}

/** Номер товару в PlayerInput.buy: 0 — нічого. */
export const BUY_WEAPON = 1;
export const BUY_ARMOR = 2;
export const BUY_ABILITY = 3;
export const BUY_MEDKIT = 4;
/** Соло: додаткове життя (автопідйом). */
export const BUY_LIFE = 5;

export function emptyInput(): PlayerInput {
  return { move: { x: 0, y: 0 }, ability: false, dash: false, buy: 0 };
}

/*
 * Протокол екран ↔ пульт.
 * Надійний упорядкований канал — JSON-повідомлення нижче (лобі, статус, події).
 * Ненадійний невпорядкований канал — бінарні пакети: ввід (повний стан пульта) і пінг.
 */

export const PROTOCOL_VERSION = 1;

/** Колір гравця = колір класу (DECISIONS.md, п. 22); спільний для екрана й пульта. */
export const CLASS_COLOR: Record<ClassId, number> = {
  assault: 0xe8323a,
  engineer: 0xff8a1f,
  medic: 0x3fd45a,
  tech: 0x2f7bff,
};

export type ScreenPhase = 'lobby' | 'match' | 'results';

export interface LobbySlotInfo {
  slot: number;
  classId: ClassId | null;
  ready: boolean;
  connected: boolean;
  kind: 'phone' | 'keyboard' | 'bot';
}

/** Пульт → екран. */
export type ControllerMessage =
  | { t: 'hello'; v: number; token: string }
  | { t: 'class'; classId: ClassId }
  | { t: 'ready'; ready: boolean }
  /** on: true — пауза (пульт утримав кнопку 0.5 с); false — продовжити, відсутніх веде бот. */
  | { t: 'pause'; on: boolean }
  /** Не віддавати відключеного гравця боту, а чекати його на паузі. */
  | { t: 'wait'; slot: number }
  /** З екрана результатів — назад у лобі (будь-який пульт). */
  | { t: 'again' };

/** Екран → пульт. */
export type ScreenMessage =
  | { t: 'welcome'; slot: number; token: string }
  | { t: 'full'; reason: 'full' | 'inMatch' | 'version' }
  | { t: 'lobby'; phase: ScreenPhase; slots: LobbySlotInfo[] }
  | {
      t: 'status';
      phase: ScreenPhase;
      classId: ClassId | null;
      hp: number;
      maxHp: number;
      parts: number;
      down: boolean;
      /** 0..1 — готовність здібності; 1 = готова. */
      ability: number;
      wave: number;
      /** Магазин між хвилями; null — закритий. */
      shop: ShopInfo | null;
      /** Поруч упалий напарник: кнопка здібності стає «підняти». */
      revive: ReviveInfo | null;
      /** Секунди до вибування, якщо впав; −1 — вибув до наступної хвилі. */
      bleed: number;
      /** Матч на паузі; null — іде (або йде відлік до продовження). */
      pause: PauseInfo | null;
      /** Секунди відліку до продовження після паузи; 0 — відліку немає. */
      resumeIn: number;
      /** Відключені гравці, яких не чекаємо: їх веде або скоро поведе бот. */
      dropped: DroppedInfo[];
    }
  | { t: 'hurt'; amount: number }
  /** Підсумок матчу для цього гравця — пульт показує власну картку. */
  | { t: 'results'; summary: MatchSummary; slot: number }
  | { t: 'bought'; item: number; ok: boolean };

/** Підсумок матчу: спільне для екрана й пульта (п. 46). */
export interface MatchSummary {
  won: boolean;
  /** Номер хвилі, до якої дійшли (1-based), і всього хвиль. */
  wave: number;
  waves: number;
  seconds: number;
  players: PlayerSummary[];
}

export interface PlayerSummary {
  classId: ClassId;
  kills: number;
  parts: number;
  revives: number;
  downs: number;
  damageDealt: number;
  damageTaken: number;
  /** Ключі відзнак (awards.ts): 'kills', 'revives', 'parts', 'tank', 'untouched'. */
  awards: string[];
}

export interface PauseInfo {
  /** Хто поставив: слот пульта, −1 — екран (клавіатура), −2 — автоматично (чекаємо гравця). */
  by: number;
  /** Слоти відключених, на яких чекаємо. */
  waiting: number[];
}

export interface DroppedInfo {
  slot: number;
  /** Секунд до того, як поведе бот; 0 — бот уже веде. */
  botIn: number;
}

export interface ReviveInfo {
  cost: number;
  /** Деталей вистачає. */
  affordable: boolean;
  /** 0..1 — прогрес утримання. */
  progress: number;
}

/** Стан магазину для пульта: рівні й ціни наступного рівня (null — максимум). */
export interface ShopInfo {
  /** Секунди до кінця паузи. */
  secondsLeft: number;
  levels: [number, number, number];
  prices: [number | null, number | null, number | null];
  /** Ціна аптечки; null — уже куплена в цій паузі. */
  medkit: number | null;
  /** Соло: ціна додаткового життя; null — не соло або вже куплено. */
  life: number | null;
}

// Бінарні пакети ненадійного каналу.
export const PKT_INPUT = 1;
export const PKT_PING = 2;
export const PKT_PONG = 3;
export const INPUT_PACKET_SIZE = 6;
export const PING_PACKET_SIZE = 5;

const BTN_ABILITY = 1;
const BTN_DASH = 2;
/** Біти 2–4 байта кнопок — номер товару 0..7. */
const BUY_SHIFT = 2;
const BUY_MASK = 7;

/** [тип u8][seq u16][x i8][y i8][кнопки u8] — 6 байт; стан, а не подія, тож втрата пакета не страшна. */
export function encodeInput(view: DataView, seq: number, inp: PlayerInput): void {
  view.setUint8(0, PKT_INPUT);
  view.setUint16(1, seq & 0xffff);
  view.setInt8(3, Math.round(Math.max(-1, Math.min(1, inp.move.x)) * 127));
  view.setInt8(4, Math.round(Math.max(-1, Math.min(1, inp.move.y)) * 127));
  view.setUint8(
    5,
    (inp.ability ? BTN_ABILITY : 0) |
      (inp.dash ? BTN_DASH : 0) |
      ((inp.buy & BUY_MASK) << BUY_SHIFT),
  );
}

/** Повертає seq пакета; ввід пишеться в out. */
export function decodeInput(view: DataView, out: PlayerInput): number {
  out.move.x = view.getInt8(3) / 127;
  out.move.y = view.getInt8(4) / 127;
  const b = view.getUint8(5);
  out.ability = (b & BTN_ABILITY) !== 0;
  out.dash = (b & BTN_DASH) !== 0;
  out.buy = (b >> BUY_SHIFT) & BUY_MASK;
  return view.getUint16(1);
}

/** Чи новіший seq a за b з урахуванням переповнення u16 (пакети невпорядковані). */
export function seqNewer(a: number, b: number): boolean {
  const d = (a - b) & 0xffff;
  return d !== 0 && d < 0x8000;
}

export function encodePing(view: DataView, type: number, id: number): void {
  view.setUint8(0, type);
  view.setUint32(1, id >>> 0);
}
