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
  /** Висота над підлогою, м. Дрони літають; заглушений дрон падає до ~0.4. */
  alt: number;
  /** Дрон (літає над низькими перешкодами). */
  air: boolean;
  /** Номер рою (для Рою) — дрони одного рою тримаються хмарою; −1 — не в рої. */
  group: number;
  /** Лічильник для черг і укусів. */
  shots: number;
  /** Точка удару (пікірування Камікадзе, ціль снайпера, приземлення Павука). */
  tx: number;
  ty: number;
  /** Точка старту стрибка Павука. */
  ox: number;
  oy: number;
  /** Щит від Ремонтника: поглинає шкоду першим. */
  shield: number;
  /** Індекс союзника, якого лікує Ремонтник; −1 — нікого. */
  ally: number;
  /** Перезарядка другорядної дії (щит Ремонтника, будівництво Прораба). */
  cd: number;
  /** Ще один таймер (виклик підкріплення Прораба). */
  t2: number;
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
      alt: 0,
      air: false,
      group: -1,
      shots: 0,
      tx: 0,
      ty: 0,
      ox: 0,
      oy: 0,
      shield: 0,
      ally: -1,
      cd: 0,
      t2: 0,
      exposed: false,
    });
  }
  return pool;
}

/** Ворог «у повітрі»: над низькими перешкодами. Рій (1.2 м) і заглушені дрони — ні. */
export function isHigh(e: Enemy): boolean {
  return e.air && e.alt > 1.5;
}

/** Павук на стіні чи на контейнері: вище за кулі й поза автоприцілом (DECISIONS.md, п. 32). */
export function outOfReach(e: Enemy): boolean {
  // 3 — SPIDER_FLIGHT; без імпорту з ai/spider, щоб не замикати цикл модулів.
  return e.type === 'spider' && e.alt > 1 && e.ai !== 3;
}
