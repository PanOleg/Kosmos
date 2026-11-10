import type { ClassId } from '../config/balance';

export interface Player {
  slot: number;
  classId: ClassId;
  x: number;
  y: number;
  /** Попередня позиція для інтерполяції рендеру. */
  px: number;
  py: number;
  vx: number;
  vy: number;
  /** Куди дивиться/цілиться, одиничний вектор. */
  fx: number;
  fy: number;
  hp: number;
  maxHp: number;
  down: boolean;
  /** Тики, що лишилися в ривку. */
  dashT: number;
  dashCd: number;
  dashDx: number;
  dashDy: number;
  /** Тики невразливості (ривок, підйом). */
  invuln: number;
  prevDash: boolean;
  prevAbility: boolean;
  fireCd: number;
  /** Ід ворога-цілі, -1 якщо немає. */
  target: number;
  parts: number;
  stats: {
    kills: number;
    partsCollected: number;
    revives: number;
    damageDealt: number;
    damageTaken: number;
  };
}

export function createPlayer(
  slot: number,
  classId: ClassId,
  x: number,
  y: number,
  hp: number,
): Player {
  return {
    slot,
    classId,
    x,
    y,
    px: x,
    py: y,
    vx: 0,
    vy: 0,
    fx: 1,
    fy: 0,
    hp,
    maxHp: hp,
    down: false,
    dashT: 0,
    dashCd: 0,
    dashDx: 0,
    dashDy: 0,
    invuln: 0,
    prevDash: false,
    prevAbility: false,
    fireCd: 0,
    target: -1,
    parts: 0,
    stats: { kills: 0, partsCollected: 0, revives: 0, damageDealt: 0, damageTaken: 0 },
  };
}
