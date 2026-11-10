export const TEAM_PLAYER = 0;
export const TEAM_ENEMY = 1;

export interface Projectile {
  alive: boolean;
  team: number;
  /** Слот гравця або індекс ворога. */
  owner: number;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  life: number;
  damage: number;
  knockback: number;
  radius: number;
}

export function createProjectilePool(capacity: number): Projectile[] {
  const pool: Projectile[] = [];
  for (let i = 0; i < capacity; i++)
    pool.push({
      alive: false,
      team: 0,
      owner: 0,
      x: 0,
      y: 0,
      px: 0,
      py: 0,
      vx: 0,
      vy: 0,
      life: 0,
      damage: 0,
      knockback: 0,
      radius: 0.1,
    });
  return pool;
}
