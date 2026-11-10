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
  'core' | 'divider' | 'container' | 'table' | 'glass' | 'planter' | 'console';

export type Obstacle = RectObstacle | CircleObstacle;

export interface SpawnPoint {
  x: number;
  y: number;
  /** Сектор: 0 північ, 1 схід, 2 південь, 3 захід. */
  sector: number;
}

export interface MapDef {
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
