/** Бар'єр Інженера: відрізок-стіна, що зупиняє ворожі снаряди й пропускає гравців. */
export interface Barrier {
  alive: boolean;
  /** Слот Інженера. */
  owner: number;
  x: number;
  y: number;
  /** Напрям уздовж стіни, одиничний. */
  ux: number;
  uy: number;
  halfLen: number;
  halfThick: number;
  hp: number;
  maxHp: number;
  /** Тики до зникнення. */
  life: number;
}

export function createBarrierPool(capacity: number): Barrier[] {
  const pool: Barrier[] = [];
  for (let i = 0; i < capacity; i++)
    pool.push({
      alive: false,
      owner: 0,
      x: 0,
      y: 0,
      ux: 1,
      uy: 0,
      halfLen: 0,
      halfThick: 0,
      hp: 0,
      maxHp: 0,
      life: 0,
    });
  return pool;
}
