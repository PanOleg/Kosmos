/** Ракета Панцира: ціль фіксована при пуску, удар по зоні через rocketWarn (зона підсвічена). */
export interface Rocket {
  alive: boolean;
  /** Звідки летить (для рендеру дуги). */
  fromX: number;
  fromY: number;
  x: number;
  y: number;
  /** Тики до удару. */
  t: number;
  total: number;
  radius: number;
  damage: number;
}

export function createRocketPool(capacity: number): Rocket[] {
  const pool: Rocket[] = [];
  for (let i = 0; i < capacity; i++)
    pool.push({
      alive: false,
      fromX: 0,
      fromY: 0,
      x: 0,
      y: 0,
      t: 0,
      total: 1,
      radius: 0,
      damage: 0,
    });
  return pool;
}
