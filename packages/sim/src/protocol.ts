import type { ClassId } from './config/balance';

export type { ClassId };

/** Ввід одного гравця за крок. Однаковий для клавіатури, бота й телефона: повний стан, не події. */
export interface PlayerInput {
  move: { x: number; y: number };
  ability: boolean;
  dash: boolean;
}

export function emptyInput(): PlayerInput {
  return { move: { x: 0, y: 0 }, ability: false, dash: false };
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
  | { t: 'ready'; ready: boolean };

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
    }
  | { t: 'hurt'; amount: number };

// Бінарні пакети ненадійного каналу.
export const PKT_INPUT = 1;
export const PKT_PING = 2;
export const PKT_PONG = 3;
export const INPUT_PACKET_SIZE = 6;
export const PING_PACKET_SIZE = 5;

const BTN_ABILITY = 1;
const BTN_DASH = 2;

/** [тип u8][seq u16][x i8][y i8][кнопки u8] — 6 байт; стан, а не подія, тож втрата пакета не страшна. */
export function encodeInput(view: DataView, seq: number, inp: PlayerInput): void {
  view.setUint8(0, PKT_INPUT);
  view.setUint16(1, seq & 0xffff);
  view.setInt8(3, Math.round(Math.max(-1, Math.min(1, inp.move.x)) * 127));
  view.setInt8(4, Math.round(Math.max(-1, Math.min(1, inp.move.y)) * 127));
  view.setUint8(5, (inp.ability ? BTN_ABILITY : 0) | (inp.dash ? BTN_DASH : 0));
}

/** Повертає seq пакета; ввід пишеться в out. */
export function decodeInput(view: DataView, out: PlayerInput): number {
  out.move.x = view.getInt8(3) / 127;
  out.move.y = view.getInt8(4) / 127;
  const b = view.getUint8(5);
  out.ability = (b & BTN_ABILITY) !== 0;
  out.dash = (b & BTN_DASH) !== 0;
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
