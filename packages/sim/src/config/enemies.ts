/** Вороги. Час — секунди, відстань — метри. Множники складності накладаються в рантаймі. */
export type EnemyType =
  | 'scout'
  | 'gunner'
  | 'wasp'
  | 'kamikaze'
  | 'sniper'
  | 'swarm'
  | 'shell'
  | 'spider'
  | 'repairer'
  | 'foreman'
  | 'turret'
  | 'core';

/** Наземні роботи, яких лікує Ремонтник (не дрони й не він сам). */
export const ROBOT_TYPES: ReadonlySet<EnemyType> = new Set([
  'scout',
  'gunner',
  'shell',
  'spider',
  'foreman',
  'turret',
]);

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

export const SHELL = {
  hp: 400,
  speed: 2,
  radius: 1.0,
  damage: 35,
  parts: 6,
  threat: 15,
  /** Зупиняється на цій відстані й обстрілює. */
  holdRange: 9,
  /** Поворот корпусу, рад/с: повільний — тому обхід працює (DECISIONS.md, п. 31). */
  turnRate: Math.PI / 3,
  rocketEvery: 4,
  rocketWarn: 1.2,
  rocketRadius: 3,
  rocketRange: 16,
  /** Удар ззаду: куля в межах ±60° від напрямку його погляду. */
  backCos: 0.5,
  backMul: 3,
} satisfies EnemyDef & Record<string, number>;

export const SPIDER = {
  hp: 60,
  speed: 5,
  radius: 0.45,
  damage: 20,
  parts: 2,
  threat: 12,
  /** Висота на стіні / на контейнері. */
  perchAlt: 2.3,
  jumpRange: 8,
  jumpEvery: 3,
  windup: 0.45,
  flight: 0.5,
  landRadius: 1.6,
  recover: 0.6,
  /** У польоті шкода по ньому ×2 і він — пріоритетна ціль. */
  flightMul: 2,
  flightThreat: 40,
} satisfies EnemyDef & Record<string, number>;

export const REPAIRER = {
  hp: 80,
  speed: 3.5,
  radius: 0.5,
  damage: 0,
  parts: 4,
  /** Пріоритет після Камікадзе (BALANCE: Камікадзе → Ремонтник → найближчий). */
  threat: 30,
  healPerSecond: 20,
  healRange: 7,
  shield: 100,
  shieldEvery: 10,
  /** Тримається не ближче до гравців. */
  keepAway: 10,
} satisfies EnemyDef & Record<string, number>;

export const FOREMAN = {
  hp: 900,
  speed: 2.5,
  radius: 1.1,
  damage: 40,
  parts: 20,
  threat: 18,
  /** Підходить на цю дистанцію. */
  approach: 5,
  /** Удар кранами: зона перед ним, підсвічена до удару. */
  strikeRange: 4.5,
  strikeOffset: 2.5,
  strikeRadius: 3,
  strikeWarn: 1.2,
  strikeEvery: 2.4,
  /** Раз на buildEvery — укриття або турель (по черзі), турелей ≤ maxTurrets за хвилю. */
  buildEvery: 6,
  maxTurrets: 2,
  /** Раз на summonEvery — summonCount Скаутів. */
  summonEvery: 9,
  summonCount: 3,
  /** Звір (ліс): стрибок на гравця раз на leapEvery, якщо той далі за leapMin; зграя з воріт. */
  leapEvery: 5,
  leapMin: 6,
  packCount: 4,
  /** Стіна-укриття, яку він ставить. */
  wallLength: 3,
  wallThick: 0.6,
  wallHeight: 1.4,
} satisfies EnemyDef & Record<string, number>;

export const TURRET = {
  hp: 150,
  speed: 0,
  radius: 0.7,
  damage: 8,
  parts: 3,
  threat: 14,
  /** Поворот, рад/с (90°/с). */
  turnRate: Math.PI / 2,
  burst: 5,
  burstGap: 0.12,
  period: 3,
  windup: 0.4,
  range: 14,
  projectileSpeed: 20,
  backCos: 0.5,
  backMul: 3,
} satisfies EnemyDef & Record<string, number>;

/** Ядро станції (фінальний бос, DECISIONS.md, п. 41). Нерухоме, стоїть на реакторі. */
export const CORE = {
  /** На фазу; фаз три. */
  hp: 1500,
  speed: 0,
  radius: 2.9,
  damage: 45,
  parts: 60,
  /** Нижче за турелі й більшість ворогів: автоприціл спершу чистить загрози. */
  threat: 8,
  /** Невразливість між фазами, с. */
  transition: 2.5,
  // Фаза 1: темрява, турелі зі стін, лазерна сітка.
  darkRadius: 8,
  wallTurrets: 6,
  wallTurretR: 25,
  gridEvery: 4.5,
  gridWarn: 1.5,
  gridFire: 0.25,
  /** Відстань між променями й половина ширини променя. */
  gridSpacing: 4.5,
  gridHalfWidth: 0.55,
  gridDamage: 40,
  /** Звір (ліс): у першій фазі — серія ударів лапами по гравцях замість сітки. */
  pawEvery: 3.5,
  pawWarn: 1.1,
  pawRadius: 3,
  pawDamage: 35,
  pawCombo: 2,
  // Фаза 2: шлюзи.
  airlockEvery: 10,
  airlockOpen: 4,
  /** Попередження перед відкриттям шлюзу (сирена, мигання). */
  airlockWarn: 1.5,
  pull: 3,
  /** Ближче за це до відкритого шлюзу — затягнуло. */
  suckRadius: 1.6,
  rocketEvery: 2.5,
  scoutEvery: 7,
  scoutCount: 3,
  // Фаза 3: робот, атаки по черзі з паузою.
  attackPause: 1.3,
  volley: 3,
  laserAim: 1.5,
  laserSpeed: 45,
  laserDamage: 50,
  craneRadius: 3.5,
  craneWarn: 1.2,
  craneDamage: 50,
  /** Не кличе Рій, якщо дрібних дронів уже стільки. */
  swarmCap: 24,
} satisfies EnemyDef & Record<string, number>;

export const ENEMIES: Record<EnemyType, EnemyDef> = {
  core: CORE,
  foreman: FOREMAN,
  turret: TURRET,
  shell: SHELL,
  spider: SPIDER,
  repairer: REPAIRER,
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
