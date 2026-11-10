/** Вороги. Час — секунди, відстань — метри. Множники складності накладаються в рантаймі. */
export type EnemyType = 'scout' | 'gunner';

export interface EnemyDef {
  hp: number;
  speed: number;
  radius: number;
  damage: number;
  parts: number;
  /** Базова вага для автоприцілу: більше = ціль вибирається охочіше. */
  threat: number;
}

export const SCOUT = {
  hp: 40,
  speed: 7,
  radius: 0.45,
  damage: 10,
  parts: 1,
  threat: 10,
  /** Дистанція, з якої починає замах. */
  attackRange: 1.5,
  /** Удар досягає цілі, якщо вона все ще ближче за це після замаху. */
  hitRange: 1.9,
  /** Телеграф: скаут присідає й світиться — час ухилитися. */
  windup: 0.35,
  recover: 0.65,
  /** Пріоритет для автоприцілу під час замаху. */
  windupThreat: 25,
  /** На такій відстані скаути розходяться навколо цілі, а не біжать гуртом. */
  surroundRadius: 5,
  /** Від'їзд від удару по ньому: мить «пробив». */
  knockback: 2.5,
} satisfies EnemyDef & Record<string, number>;

export const GUNNER = {
  hp: 70,
  speed: 4,
  radius: 0.5,
  damage: 12,
  parts: 2,
  threat: 15,
  /** Укриття шукається на такій відстані від цілі. */
  coverMin: 6,
  coverMax: 10,
  /** Пауза за укриттям між пострілами. Ритм з BALANCE: постріл раз на ~1.5 с. */
  hide: 0.9,
  /** Скільки триває визирання; з них aim — видимий телеграф перед пострілом. */
  peek: 0.6,
  aim: 0.45,
  projectileSpeed: 16,
  projectileRadius: 0.25,
  range: 14,
  /** Скільки секунд терпить, коли гравець обійшов укриття, перш ніж тікати на нове. */
  flankedPatience: 0.9,
  /** Без укриття стріляє з відкритої позиції на цій дистанції, кружляючи. */
  openRange: 8,
  /** Відстань, на якій укриття вважається зайнятим іншим Стрільцем. */
  coverSpacing: 2.5,
  /** Перебір кандидатів не частіше, тики. */
  coverSearchEvery: 20,
  /** Крок визирання й повернення швидший за звичайний біг. */
  peekSpeed: 1.6,
  /** Нове укриття мусить бути кращим на стільки балів, щоб змінити вже вибране. */
  coverHysteresis: 3,
} satisfies EnemyDef & Record<string, number>;

export const ENEMIES: Record<EnemyType, EnemyDef> = { scout: SCOUT, gunner: GUNNER };

export const ENEMY_TYPE_IDS: EnemyType[] = ['scout', 'gunner'];

/** Розштовхування ворогів між собою. */
export const CROWD = { separation: 1.15, strength: 14 };
