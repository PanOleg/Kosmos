/**
 * Стан фінального боса поза його тілом-ворогом: фаза, таймери атак, лазерна сітка, шлюз.
 * Простий об'єкт — серіалізується разом з GameState.
 */
export interface BossState {
  /** 0 — боса немає; 1..3 — фаза. */
  phase: number;
  /** Індекс тіла Ядра в пулі ворогів, −1 — немає. */
  index: number;
  /** Тики невразливості між фазами (перехід). */
  transition: number;
  /** Лазерна сітка: 0 — тиша, 1 — підсвічування, 2 — удар. */
  grid: number;
  gridT: number;
  /** Напрям променів (кут нормалі до них) і зсув сітки вздовж нормалі, м. */
  gridAngle: number;
  gridOffset: number;
  /** Шлюз фази 2: індекс, −1 — усі закриті; airlockState 1 — попередження, 2 — відкритий. */
  airlock: number;
  airlockState: number;
  airlockT: number;
  rocketT: number;
  scoutT: number;
  /** Фаза 3: номер атаки в циклі, її стан (0 — пауза, 1 — замах) і таймер. */
  attack: number;
  attackState: number;
  attackT: number;
  /** Точка удару (кран) або ціль лазера. */
  tx: number;
  ty: number;
}

export function createBossState(): BossState {
  return {
    phase: 0,
    index: -1,
    transition: 0,
    grid: 0,
    gridT: 0,
    gridAngle: 0,
    gridOffset: 0,
    airlock: -1,
    airlockState: 0,
    airlockT: 0,
    rocketT: 0,
    scoutT: 0,
    attack: 0,
    attackState: 0,
    attackT: 0,
    tx: 0,
    ty: 0,
  };
}
