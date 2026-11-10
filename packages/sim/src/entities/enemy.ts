import type { EnemyType } from '../config/enemies';

/** Номер стану AI; значення залежать від типу ворога (див. ai/*). */
export interface Enemy {
  alive: boolean;
  /** Росте при кожному перевикористанні слота пулу: посилання = (index, gen). */
  gen: number;
  type: EnemyType;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  fx: number;
  fy: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  ai: number;
  aiT: number;
  /** Слот гравця-цілі, -1 немає. */
  target: number;
  /** Довільний кут обходу цілі, щоб група оточувала. */
  flank: number;
  /** Індекс укриття, -1 немає (для Стрільця). */
  cover: number;
  coverX: number;
  coverY: number;
  /** Точка визирання: поруч з укриттям, звідки видно ціль. */
  peekX: number;
  peekY: number;
  /** Тики відкидання після влучання. */
  stagger: number;
  /** Тики глушіння ЕМІ: не рухається й не атакує, вразливий. */
  stun: number;
  /** Ворог «відкритий»: у вікні вразливості (визирає, замахується). */
  exposed: boolean;
}

export function createEnemyPool(capacity: number): Enemy[] {
  const pool: Enemy[] = [];
  for (let i = 0; i < capacity; i++) {
    pool.push({
      alive: false,
      gen: 0,
      type: 'scout',
      x: 0,
      y: 0,
      px: 0,
      py: 0,
      vx: 0,
      vy: 0,
      fx: 1,
      fy: 0,
      radius: 0.5,
      hp: 0,
      maxHp: 0,
      speed: 0,
      damage: 0,
      ai: 0,
      aiT: 0,
      target: -1,
      flank: 0,
      cover: -1,
      coverX: 0,
      coverY: 0,
      peekX: 0,
      peekY: 0,
      stagger: 0,
      stun: 0,
      exposed: false,
    });
  }
  return pool;
}
