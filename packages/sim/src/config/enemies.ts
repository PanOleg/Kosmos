/** Вороги. Час — секунди, відстань — метри. Множники складності накладаються в рантаймі. */
export type EnemyType = 'scout' | 'gunner' | 'wasp' | 'kamikaze' | 'sniper' | 'swarm';

/** Дрони літають; решта — наземні. */
export const AIR_TYPES: ReadonlySet<EnemyType> = new Set(['wasp', 'kamikaze', 'sniper', 'swarm']);

/** Перешкоди нижчі за це не заважають ні дронам, ні пострілам по них (DECISIONS.md, п. 28). */
export const AIR_COVER_HEIGHT = 2;

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

export const WASP = {
  hp: 30,
  speed: 9,
  radius: 0.4,
  damage: 6,
  parts: 2,
  threat: 12,
  altitude: 3,
  /** Тримає цю дистанцію, кружляючи навколо цілі. */
  orbit: 8,
  /** Черга: стільки пострілів з таким інтервалом, раз на period. */
  burst: 3,
  burstGap: 0.12,
  period: 2,
  /** Телеграф перед чергою. */
  windup: 0.35,
  projectileSpeed: 18,
  range: 13,
} satisfies EnemyDef & Record<string, number>;

export const KAMIKAZE = {
  hp: 50,
  speed: 11,
  radius: 0.45,
  damage: 50,
  parts: 2,
  /** Вага загрози, коли вразливий (збоку, ззаду чи на землі після ЕМІ). */
  threat: 40,
  altitude: 2.5,
  /** З цієї відстані починає замах на пікірування. */
  diveRange: 7,
  /** Телеграф: світиться й «прицілюється», на підлозі видно точку удару. */
  windup: 0.6,
  diveSpeed: 13,
  /** Найдовше пікірування, с: далі вибух на місці. */
  maxDive: 1.5,
  blastRadius: 2,
  /** Лобова броня: куля назустріч носу в цьому куті не шкодить (cos 60°). */
  frontCos: 0.5,
  /** Наближається повільніше, ніж пікірує: інакше нема коли збити збоку. */
  approachSpeedMul: 0.55,
} satisfies EnemyDef & Record<string, number>;

export const SNIPER = {
  hp: 45,
  speed: 3,
  radius: 0.45,
  damage: 40,
  parts: 3,
  threat: 14,
  altitude: 4,
  /** Висить на цій відстані від цілі (DECISIONS.md, п. 3: 15–17 м з дрейфом). */
  holdMin: 15,
  holdMax: 17,
  aim: 2,
  cooldown: 3,
  projectileSpeed: 42,
  range: 22,
  /** Поки цілиться, автоприціл бере його охочіше. */
  aimThreat: 20,
} satisfies EnemyDef & Record<string, number>;

export const SWARM = {
  hp: 10,
  speed: 8,
  radius: 0.22,
  damage: 3,
  parts: 0.25,
  threat: 6,
  altitude: 1.2,
  /** Кусає раз на секунду, коли ближче за biteRange. */
  biteRange: 0.9,
  biteEvery: 1,
  /** Радіус хмари навколо центру рою. */
  cloud: 2,
  /** Скільки дронів у рої. */
  count: 12,
} satisfies EnemyDef & Record<string, number>;

export const ENEMIES: Record<EnemyType, EnemyDef> = {
  scout: SCOUT,
  gunner: GUNNER,
  wasp: WASP,
  kamikaze: KAMIKAZE,
  sniper: SNIPER,
  swarm: SWARM,
};

export const ENEMY_TYPE_IDS: EnemyType[] = [
  'scout',
  'gunner',
  'wasp',
  'kamikaze',
  'sniper',
  'swarm',
];

/** Розштовхування ворогів між собою. */
export const CROWD = { separation: 1.15, strength: 14 };
