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
  /** Цього тику натиснуто здібність (передній фронт кнопки). */
  abilityPressed: boolean;
  /** Тики до готовності здібності. */
  abilityCd: number;
  /** Тики дії здібності (перевантаження, поле); 0 — не активна. */
  abilityT: number;
  /** Тики перегріву Штурмовика після перевантаження: стріляти не можна. */
  overheatT: number;
  /** Рівні покращень 0..3. */
  upg: { weapon: number; armor: number; ability: number };
  /** Номер товару, натиснутий цього тику (передній фронт), 0 — нічого. */
  buyPressed: number;
  prevBuy: number;
  /** Аптечку вже куплено в цій паузі. */
  medkitBought: boolean;
  fireCd: number;
  /** Ід ворога-цілі, -1 якщо немає. */
  target: number;
  parts: number;
  stats: {
    kills: number;
    partsCollected: number;
    partsSpent: number;
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
    abilityPressed: false,
    abilityCd: 0,
    abilityT: 0,
    overheatT: 0,
    upg: { weapon: 0, armor: 0, ability: 0 },
    buyPressed: 0,
    prevBuy: 0,
    medkitBought: false,
    fireCd: 0,
    target: -1,
    parts: 0,
    stats: {
      kills: 0,
      partsCollected: 0,
      partsSpent: 0,
      revives: 0,
      damageDealt: 0,
      damageTaken: 0,
    },
  };
}
