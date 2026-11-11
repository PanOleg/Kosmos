/**
 * Станція «Горизонт». Площина XY, +Y = північ. Перешкоди — повернуті прямокутники (OBB) і кола.
 * blocksShots=false: розбите скло лабораторії — тримає тіло, але не кулі й не погляд.
 */
export interface RectObstacle {
  kind: 'rect';
  x: number;
  y: number;
  hw: number;
  hh: number;
  rot: number;
  height: number;
  blocksShots: boolean;
  tag: ObstacleTag;
}

export interface CircleObstacle {
  kind: 'circle';
  x: number;
  y: number;
  r: number;
  height: number;
  blocksShots: boolean;
  tag: ObstacleTag;
}

export type ObstacleTag =
  | 'core'
  | 'divider'
  | 'container'
  | 'table'
  | 'glass'
  | 'planter'
  | 'console'
  | 'rim'
  | 'barricade'
  // Пустеля (п. 49).
  | 'rock'
  | 'tent'
  | 'wreck'
  | 'crate'
  | 'palm'
  | 'sandbag'
  // Крижана база (п. 61).
  | 'ice'
  | 'snowbank'
  | 'module'
  | 'pine'
  | 'sled'
  // Чарівний ліс (п. 73).
  | 'boulder'
  | 'roots'
  | 'mushroom'
  | 'tree'
  | 'log'
  | 'stump';

export type Obstacle = RectObstacle | CircleObstacle;

export interface SpawnPoint {
  x: number;
  y: number;
  /** Сектор: 0 північ, 1 схід, 2 південь, 3 захід. */
  sector: number;
}

export type MapId = 'station' | 'desert' | 'ice' | 'forest';

/** Зона, де наземні йдуть повільніше (зибучі піски, глибокий сніг); ривок її перетинає. */
export interface SlowZone {
  x: number;
  y: number;
  r: number;
  /** Множник швидкості всередині. */
  mul: number;
}

/** Буря (DECISIONS.md, п. 60): раз на every секунд бою — warn с попередження, duration с бурі. */
export interface StormDef {
  every: number;
  warn: number;
  duration: number;
  /** Множник дальності автоприцілу гравців під час бурі. */
  aimMul: number;
}

export interface MapDef {
  id: MapId;
  slowZones?: SlowZone[];
  storm?: StormDef;
  /** Групи ворогів діляться між кількома точками появи, а не виходять з однієї. */
  scatterSpawns?: boolean;
  radius: number;
  obstacles: Obstacle[];
  airlocks: SpawnPoint[];
  vents: SpawnPoint[];
  playerSpawns: { x: number; y: number }[];
}

function rect(
  x: number,
  y: number,
  w: number,
  h: number,
  tag: ObstacleTag,
  opts: { rot?: number; height?: number; blocksShots?: boolean } = {},
): RectObstacle {
  return {
    kind: 'rect',
    x,
    y,
    hw: w / 2,
    hh: h / 2,
    rot: opts.rot ?? 0,
    height: opts.height ?? 1.6,
    blocksShots: opts.blocksShots ?? true,
    tag,
  };
}

function circle(x: number, y: number, r: number, tag: ObstacleTag, height = 1.2): CircleObstacle {
  return { kind: 'circle', x, y, r, height, blocksShots: true, tag };
}

function buildObstacles(): Obstacle[] {
  const o: Obstacle[] = [];

  // Центр: ядро реактора й кілька пультів. Майже відкрито — ризик проти винагороди.
  o.push(circle(0, 0, 2.6, 'core', 4));
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    o.push(rect(Math.cos(a) * 6.5, Math.sin(a) * 6.5, 1.4, 0.7, 'console', { rot: a, height: 1 }));
  }

  // Бортик реакторної зали (DECISIONS.md, п. 25): тримає тіла, але не кулі й не погляд —
  // силует зали з макета без закритого бою. Чотири проходи по сторонах світу.
  const RIM_R = 10.5;
  const GATE = 2.2 / RIM_R;
  for (let q = 0; q < 4; q++) {
    const start = (q * Math.PI) / 2 + GATE;
    const end = ((q + 1) * Math.PI) / 2 - GATE;
    const n = 6;
    for (let k = 0; k < n; k++) {
      const a0 = start + ((end - start) * k) / n;
      const a1 = start + ((end - start) * (k + 1)) / n;
      const am = (a0 + a1) / 2;
      const len = 2 * RIM_R * Math.sin((a1 - a0) / 2) + 0.12;
      o.push(
        rect(Math.cos(am) * RIM_R, Math.sin(am) * RIM_R, len, 0.4, 'rim', {
          rot: am + Math.PI / 2,
          height: 0.7,
          blocksShots: false,
        }),
      );
    }
  }

  // Розділювачі секторів по діагоналях з проходами біля центру й біля краю.
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const r = 18;
    o.push(rect(Math.cos(a) * r, Math.sin(a) * r, 8, 0.8, 'divider', { rot: a, height: 3 }));
  }

  // Північ: вантажний відсік, ряди контейнерів — лабіринт, зона Стрільців.
  const cols = [-7.5, -2.5, 2.5, 7.5];
  const rows = [13, 17.5, 22];
  for (let ri = 0; ri < rows.length; ri++) {
    for (let ci = 0; ci < cols.length; ci++) {
      const x = cols[ci]! + (ri % 2 === 0 ? 0 : 1.2);
      const y = rows[ri]!;
      if (Math.hypot(x, y) > 26) continue;
      o.push(rect(x, y, 3.2, 1.6, 'container', { height: 2.2 }));
    }
  }

  // Схід: лабораторія — столи й розбиті скляні перегородки, вузькі проходи.
  o.push(rect(13, 4, 0.15, 5, 'glass', { blocksShots: false, height: 2.2 }));
  o.push(rect(13, -4, 0.15, 4, 'glass', { blocksShots: false, height: 2.2 }));
  o.push(rect(19, 6, 4, 0.15, 'glass', { blocksShots: false, height: 2.2 }));
  o.push(rect(19, -6, 4, 0.15, 'glass', { blocksShots: false, height: 2.2 }));
  o.push(rect(16, 1.5, 2.4, 1.1, 'table', { height: 0.9 }));
  o.push(rect(16, -1.8, 2.4, 1.1, 'table', { height: 0.9 }));
  o.push(rect(21.5, 1, 1.1, 3, 'table', { height: 0.9 }));
  o.push(rect(24, -3, 1.1, 2.4, 'table', { height: 0.9 }));
  o.push(rect(22, 9.5, 2.4, 1.1, 'table', { height: 0.9, rot: 0.4 }));
  o.push(rect(22, -9.5, 2.4, 1.1, 'table', { height: 0.9, rot: -0.4 }));

  // Південь: оранжерея — круглі клумби й грядки, природні укриття.
  const planters: [number, number, number][] = [
    [-6, -13, 1.5],
    [5, -12.5, 1.3],
    [0, -17, 1.8],
    [-9, -19, 1.2],
    [8.5, -19.5, 1.4],
    [-3.5, -22.5, 1.1],
    [4, -23.5, 1.2],
  ];
  for (const [x, y, r] of planters) o.push(circle(x, y, r, 'planter', 1));
  o.push(rect(-12, -14, 1, 4, 'planter', { rot: -0.6, height: 0.8 }));
  o.push(rect(12, -14, 1, 4, 'planter', { rot: 0.6, height: 0.8 }));

  // Захід: оглядова палуба — навмисно порожня, найкраще видно дронів.
  return o;
}

function sectorPoint(sector: number, r: number): SpawnPoint {
  const a = Math.PI / 2 - (sector * Math.PI) / 2;
  return {
    x: Math.round(Math.cos(a) * r * 100) / 100,
    y: Math.round(Math.sin(a) * r * 100) / 100,
    sector,
  };
}

export const MAP: MapDef = {
  id: 'station',
  radius: 30,
  obstacles: buildObstacles(),
  airlocks: [0, 1, 2, 3].map((s) => sectorPoint(s, 28.5)),
  vents: [0, 1, 2, 3].map((s) => sectorPoint(s, 20)),
  playerSpawns: [
    { x: -9, y: 2 },
    { x: -9, y: -2 },
    { x: -11, y: 2 },
    { x: -11, y: -2 },
  ],
};

/**
 * Пустельний аванпост (DECISIONS.md, п. 49): той самий скелет, що й станція — центр з
 * обладнанням (на ньому з'являється Ядро), низький бортик із чотирма проходами на r = 10.5,
 * скельні хребти на діагоналях, ті самі точки появи (ворота каньйонів і точки скидання дронів) —
 * тож хвилі, бос і баланс працюють без змін. Різниться наповнення секторів: північ — скелі
 * каньйону, схід — покинутий табір (намети, ящики, розбитий джип), південь — оаза з пальмами,
 * захід — відкриті дюни, де з'являються гравці.
 */
function buildDesertObstacles(): Obstacle[] {
  const o: Obstacle[] = [];
  o.push(circle(0, 0, 2.6, 'core', 4));
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    o.push(rect(Math.cos(a) * 6.5, Math.sin(a) * 6.5, 1.4, 0.7, 'crate', { rot: a, height: 1 }));
  }
  // Низький бортик із мішків з піском — як бортик реакторної зали, з тими ж проходами.
  const RIM_R = 10.5;
  const GATE = 2.2 / RIM_R;
  for (let q = 0; q < 4; q++) {
    const start = (q * Math.PI) / 2 + GATE;
    const end = ((q + 1) * Math.PI) / 2 - GATE;
    const n = 6;
    for (let k = 0; k < n; k++) {
      const a0 = start + ((end - start) * k) / n;
      const a1 = start + ((end - start) * (k + 1)) / n;
      const am = (a0 + a1) / 2;
      const len = 2 * RIM_R * Math.sin((a1 - a0) / 2) + 0.12;
      o.push(
        rect(Math.cos(am) * RIM_R, Math.sin(am) * RIM_R, len, 0.5, 'sandbag', {
          rot: am + Math.PI / 2,
          height: 0.7,
          blocksShots: false,
        }),
      );
    }
  }
  // Скельні хребти на діагоналях (як перегородки станції): високі — Павук чіпляється за них.
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    o.push(rect(Math.cos(a) * 18, Math.sin(a) * 18, 8, 1.2, 'rock', { rot: a, height: 3 }));
  }
  // Північ: каньйон — брили на місці контейнерів, трохи зсунуті й різного розміру.
  const cols = [-7.5, -2.5, 2.5, 7.5];
  const rows = [13, 17.5, 22];
  for (let ri = 0; ri < rows.length; ri++)
    for (let ci = 0; ci < cols.length; ci++) {
      const x = cols[ci]! + (ri % 2 === 0 ? 0 : 1.2) + ((ci * 7 + ri * 3) % 5) * 0.12 - 0.24;
      const y = rows[ri]!;
      if (Math.hypot(x, y) > 26) continue;
      const r = 1.1 + ((ci + ri * 2) % 3) * 0.25;
      o.push(circle(x, y, r, 'rock', 2.4));
    }
  // Схід: покинутий табір.
  o.push(rect(14.5, 4, 3.2, 2.4, 'tent', { height: 2 }));
  o.push(rect(14.5, -4, 3.2, 2.4, 'tent', { height: 2 }));
  o.push(rect(20.5, 7, 2.6, 2.2, 'tent', { height: 1.9, rot: 0.3 }));
  o.push(rect(18, 0, 3.2, 1.6, 'wreck', { height: 1.4, rot: 0.5 }));
  o.push(rect(22.5, -5.5, 1.2, 1.2, 'crate', { height: 1.1, rot: 0.2 }));
  o.push(rect(23.5, -3.8, 1.2, 1.2, 'crate', { height: 1.1, rot: -0.3 }));
  o.push(rect(24.5, 2.5, 1.1, 2.6, 'crate', { height: 0.9 }));
  o.push(rect(21, -9.5, 2.4, 1.1, 'crate', { height: 0.9, rot: -0.4 }));
  // Південь: оаза — пальми на піщаних острівцях, у центрі ставок.
  const palms: [number, number, number][] = [
    [-6, -13, 1.5],
    [5, -12.5, 1.3],
    [0, -17, 1.8],
    [-9, -19, 1.2],
    [8.5, -19.5, 1.4],
    [-3.5, -22.5, 1.1],
    [4, -23.5, 1.2],
  ];
  for (const [x, y, r] of palms) o.push(circle(x, y, r, 'palm', 1));
  o.push(rect(-12, -14, 1, 4, 'sandbag', { rot: -0.6, height: 0.8 }));
  o.push(rect(12, -14, 1, 4, 'sandbag', { rot: 0.6, height: 0.8 }));
  // Поодинокі пальми по всьому аванпосту (на «Кризі» — ялини): тонкі укриття поза оазою,
  // осторонь воріт, старту гравців і зон сповільнення.
  const lonePalms: [number, number][] = [
    [-20, 13],
    [-21, -12.5],
    [-18, -4.5],
    [-26, 6],
    [25.5, 9],
    [17, -12],
    [12, 8.5],
    [-12.5, 19.5],
    [12.5, 21],
    [-14, -21],
    [14, -22],
  ];
  for (const [x, y] of lonePalms) o.push(circle(x, y, 0.7, 'palm', 1));
  // Захід: дюни — лише кілька каменів біля краю, простір для старту лишається вільним.
  o.push(circle(-22, 9, 1.0, 'rock', 1.2));
  o.push(circle(-24, -7, 1.2, 'rock', 1.4));
  return o;
}

export const DESERT_MAP: MapDef = {
  ...MAP,
  id: 'desert',
  obstacles: buildDesertObstacles(),
  // Зибучі піски: на відкритих місцях між секторами — зрізати кут через них дорожче.
  slowZones: [
    { x: -15, y: 9, r: 2.6, mul: 0.5 },
    { x: -15, y: -9, r: 2.6, mul: 0.5 },
    { x: 9, y: -17.5, r: 2.2, mul: 0.5 },
    { x: 13, y: 13.5, r: 2.4, mul: 0.5 },
    { x: -24, y: 0, r: 2.2, mul: 0.5 },
  ],
  storm: { every: 50, warn: 3, duration: 9, aimMul: 0.55 },
  scatterSpawns: true,
};

/**
 * Крижана база (DECISIONS.md, п. 61): той самий скелет; північ — крижані брили, схід — модулі
 * бази й снігохід, південь — ялини, захід — рівний сніг зі стартом. Замети сповільнюють.
 */
function buildIceObstacles(): Obstacle[] {
  const retag: Partial<Record<ObstacleTag, ObstacleTag>> = {
    rock: 'ice',
    sandbag: 'snowbank',
    tent: 'module',
    palm: 'pine',
    wreck: 'sled',
  };
  return buildDesertObstacles().map((o) => ({ ...o, tag: retag[o.tag] ?? o.tag }));
}

export const ICE_MAP: MapDef = {
  ...MAP,
  id: 'ice',
  obstacles: buildIceObstacles(),
  slowZones: [
    { x: -16, y: 8, r: 3, mul: 0.6 },
    { x: -16, y: -8, r: 3, mul: 0.6 },
    { x: 10, y: -18, r: 2.4, mul: 0.6 },
    { x: 12, y: 14, r: 2.6, mul: 0.6 },
  ],
  // Хуртовина: рідше й коротше за піщану бурю, приціл просідає менше.
  storm: { every: 60, warn: 3, duration: 8, aimMul: 0.6 },
};

/**
 * Чарівний ліс (DECISIONS.md, п. 73): скелет пустелі, віддзеркалений північ↔південь, щоб
 * карта ходилась інакше: гай світних дерев тепер на півночі, каміння — на півдні. Намети —
 * велетенські гриби, мішки — коріння, джип — повалений стовбур, ящики — пні.
 * Трясовина сповільнює; бур немає; вороги виходять з усіх боків.
 */
function buildForestObstacles(): Obstacle[] {
  const retag: Partial<Record<ObstacleTag, ObstacleTag>> = {
    rock: 'boulder',
    sandbag: 'roots',
    tent: 'mushroom',
    palm: 'tree',
    wreck: 'log',
    crate: 'stump',
  };
  return buildDesertObstacles().map((o) => {
    const tag = retag[o.tag] ?? o.tag;
    return o.kind === 'rect' ? { ...o, y: -o.y, rot: -o.rot, tag } : { ...o, y: -o.y, tag };
  });
}

export const FOREST_MAP: MapDef = {
  ...MAP,
  id: 'forest',
  obstacles: buildForestObstacles(),
  slowZones: [
    { x: -15, y: -9, r: 2.6, mul: 0.55 },
    { x: -15, y: 9, r: 2.6, mul: 0.55 },
    { x: 9, y: 17.5, r: 2.2, mul: 0.55 },
    { x: 13, y: -13.5, r: 2.4, mul: 0.55 },
    { x: -24, y: 0, r: 2.2, mul: 0.55 },
  ],
  scatterSpawns: true,
};

export const MAPS: Record<MapId, MapDef> = {
  station: MAP,
  desert: DESERT_MAP,
  ice: ICE_MAP,
  forest: FOREST_MAP,
};

/** Множник швидкості наземного в точці: найповільніша із зон, що накривають її. */
export function slowAt(map: MapDef, x: number, y: number): number {
  let m = 1;
  if (map.slowZones)
    for (const z of map.slowZones)
      if ((x - z.x) ** 2 + (y - z.y) ** 2 < z.r * z.r) m = Math.min(m, z.mul);
  return m;
}
