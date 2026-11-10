export interface Pickup {
  alive: boolean;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  value: number;
  life: number;
  /** Слот гравця, до якого магнітиться, -1 — ні до кого. */
  magnet: number;
}

export function createPickupPool(capacity: number): Pickup[] {
  const pool: Pickup[] = [];
  for (let i = 0; i < capacity; i++)
    pool.push({
      alive: false,
      x: 0,
      y: 0,
      px: 0,
      py: 0,
      vx: 0,
      vy: 0,
      value: 1,
      life: 0,
      magnet: -1,
    });
  return pool;
}
