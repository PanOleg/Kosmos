import type { MapDef, Obstacle } from '../config/map';

/**
 * Статична геометрія арени з рівномірною сіткою для широкої фази.
 * Кожна перешкода записана в усі клітинки, які перетинає її AABB; дублікати при запиті
 * відсікаються штампом, щоб не алокувати Set у гарячому циклі.
 */
export interface StaticWorld {
  radius: number;
  obstacles: PreparedObstacle[];
  cellSize: number;
  gridMin: number;
  gridN: number;
  cells: number[][];
  stamp: Uint32Array;
  stampValue: number;
  /** Буфер результатів queryNear: індекси перешкод, валідні до наступного запиту. */
  query: Int32Array;
  queryCount: number;
  /** Індекс першого динамічного слота в obstacles. */
  dynamicBase: number;
}

export interface PreparedObstacle {
  src: Obstacle;
  index: number;
  x: number;
  y: number;
  isCircle: boolean;
  r: number;
  hw: number;
  hh: number;
  cos: number;
  sin: number;
  blocksShots: boolean;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Динамічні слоти (укриття Прораба) неактивні, поки їх не поставили. */
  active: boolean;
}

function prepare(o: Obstacle, index: number): PreparedObstacle {
  if (o.kind === 'circle') {
    return {
      src: o,
      index,
      x: o.x,
      y: o.y,
      isCircle: true,
      r: o.r,
      hw: 0,
      hh: 0,
      cos: 1,
      sin: 0,
      blocksShots: o.blocksShots,
      minX: o.x - o.r,
      minY: o.y - o.r,
      maxX: o.x + o.r,
      maxY: o.y + o.r,
      active: true,
    };
  }
  const c = Math.cos(o.rot);
  const s = Math.sin(o.rot);
  const ex = Math.abs(c) * o.hw + Math.abs(s) * o.hh;
  const ey = Math.abs(s) * o.hw + Math.abs(c) * o.hh;
  return {
    src: o,
    index,
    x: o.x,
    y: o.y,
    isCircle: false,
    r: 0,
    hw: o.hw,
    hh: o.hh,
    cos: c,
    sin: s,
    blocksShots: o.blocksShots,
    minX: o.x - ex,
    minY: o.y - ey,
    maxX: o.x + ex,
    maxY: o.y + ey,
    active: true,
  };
}

/** Скільки динамічних перешкод (укриття Прораба) може стояти одночасно. */
export const DYNAMIC_SLOTS = 8;

function cellRange(
  w: Pick<StaticWorld, 'gridMin' | 'cellSize' | 'gridN'>,
  p: PreparedObstacle,
  fn: (cell: number) => void,
): void {
  const x0 = Math.max(0, Math.floor((p.minX - w.gridMin) / w.cellSize));
  const x1 = Math.min(w.gridN - 1, Math.floor((p.maxX - w.gridMin) / w.cellSize));
  const y0 = Math.max(0, Math.floor((p.minY - w.gridMin) / w.cellSize));
  const y1 = Math.min(w.gridN - 1, Math.floor((p.maxY - w.gridMin) / w.cellSize));
  for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) fn(gy * w.gridN + gx);
}

export function buildWorld(map: MapDef, cellSize = 4): StaticWorld {
  const gridMin = -map.radius - cellSize;
  const gridN = Math.ceil((map.radius * 2 + cellSize * 2) / cellSize);
  const cells: number[][] = Array.from({ length: gridN * gridN }, () => []);
  const obstacles = map.obstacles.map(prepare);
  for (const p of obstacles)
    cellRange({ gridMin, cellSize, gridN }, p, (c) => cells[c]!.push(p.index));
  // Динамічні слоти в кінці масиву: вимкнені, у сітці не зареєстровані.
  for (let i = 0; i < DYNAMIC_SLOTS; i++) {
    const p = prepare(
      {
        kind: 'rect',
        x: 0,
        y: 0,
        hw: 0.1,
        hh: 0.1,
        rot: 0,
        height: 1.4,
        blocksShots: true,
        tag: 'barricade',
      },
      obstacles.length,
    );
    p.active = false;
    obstacles.push(p);
  }
  return {
    radius: map.radius,
    obstacles,
    cellSize,
    gridMin,
    gridN,
    cells,
    stamp: new Uint32Array(obstacles.length),
    stampValue: 0,
    query: new Int32Array(obstacles.length),
    queryCount: 0,
    dynamicBase: obstacles.length - DYNAMIC_SLOTS,
  };
}

/** Ставить прямокутну перешкоду в динамічний слот (укриття Прораба). */
export function setDynamic(
  w: StaticWorld,
  slot: number,
  x: number,
  y: number,
  len: number,
  thick: number,
  rot: number,
  height: number,
): PreparedObstacle {
  clearDynamic(w, slot);
  const index = w.dynamicBase + slot;
  const p = prepare(
    {
      kind: 'rect',
      x,
      y,
      hw: len / 2,
      hh: thick / 2,
      rot,
      height,
      blocksShots: true,
      tag: 'barricade',
    },
    index,
  );
  w.obstacles[index] = p;
  cellRange(w, p, (c) => w.cells[c]!.push(index));
  return p;
}

export function clearDynamic(w: StaticWorld, slot: number): void {
  const index = w.dynamicBase + slot;
  const p = w.obstacles[index]!;
  if (!p.active) return;
  cellRange(w, p, (c) => {
    const cell = w.cells[c]!;
    const k = cell.indexOf(index);
    if (k >= 0) cell.splice(k, 1);
  });
  p.active = false;
}

/** Заповнює w.query перешкодами з клітинок, які перетинає AABB, без дублікатів. Повертає кількість. */
export function queryNear(
  w: StaticWorld,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): number {
  const n = w.gridN;
  const x0 = Math.max(0, Math.floor((minX - w.gridMin) / w.cellSize));
  const x1 = Math.min(n - 1, Math.floor((maxX - w.gridMin) / w.cellSize));
  const y0 = Math.max(0, Math.floor((minY - w.gridMin) / w.cellSize));
  const y1 = Math.min(n - 1, Math.floor((maxY - w.gridMin) / w.cellSize));
  const v = ++w.stampValue;
  let count = 0;
  for (let gy = y0; gy <= y1; gy++) {
    for (let gx = x0; gx <= x1; gx++) {
      const cell = w.cells[gy * n + gx]!;
      for (let i = 0; i < cell.length; i++) {
        const idx = cell[i]!;
        if (w.stamp[idx] === v) continue;
        w.stamp[idx] = v;
        if (!w.obstacles[idx]!.active) continue;
        w.query[count++] = idx;
      }
    }
  }
  w.queryCount = count;
  return count;
}

/** Результат розштовхування, перевикористовується між викликами. */
export const pushOut = { x: 0, y: 0, hit: false };

/**
 * Виштовхує коло з усіх перешкод і тримає всередині арени.
 * Два проходи: у кутах між двома перешкодами одного проходу інколи замало.
 */
export function resolveCircle(w: StaticWorld, x: number, y: number, r: number): typeof pushOut {
  let hit = false;
  for (let pass = 0; pass < 2; pass++) {
    const count = queryNear(w, x - r, y - r, x + r, y + r);
    for (let qi = 0; qi < count; qi++) {
      const o = w.obstacles[w.query[qi]!]!;
      if (o.isCircle) {
        const dx = x - o.x;
        const dy = y - o.y;
        const d2 = dx * dx + dy * dy;
        const rr = r + o.r;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 1e-6;
        const k = (rr - d) / d;
        x += dx * k;
        y += dy * k;
        hit = true;
        continue;
      }
      // У локальних координатах OBB.
      const dx = x - o.x;
      const dy = y - o.y;
      const lx = dx * o.cos + dy * o.sin;
      const ly = -dx * o.sin + dy * o.cos;
      const cx = lx < -o.hw ? -o.hw : lx > o.hw ? o.hw : lx;
      const cy = ly < -o.hh ? -o.hh : ly > o.hh ? o.hh : ly;
      let nx = lx - cx;
      let ny = ly - cy;
      const d2 = nx * nx + ny * ny;
      let pushL: number;
      if (d2 > 1e-12) {
        if (d2 >= r * r) continue;
        const d = Math.sqrt(d2);
        pushL = r - d;
        nx /= d;
        ny /= d;
      } else {
        // Центр усередині прямокутника: виштовхуємо через найближчу грань.
        const px = o.hw - Math.abs(lx);
        const py = o.hh - Math.abs(ly);
        if (px < py) {
          nx = lx < 0 ? -1 : 1;
          ny = 0;
          pushL = px + r;
        } else {
          nx = 0;
          ny = ly < 0 ? -1 : 1;
          pushL = py + r;
        }
      }
      x += (nx * o.cos - ny * o.sin) * pushL;
      y += (nx * o.sin + ny * o.cos) * pushL;
      hit = true;
    }
  }
  const maxR = w.radius - r;
  const d2 = x * x + y * y;
  if (d2 > maxR * maxR) {
    const k = maxR / Math.sqrt(d2);
    x *= k;
    y *= k;
    hit = true;
  }
  pushOut.x = x;
  pushOut.y = y;
  pushOut.hit = hit;
  return pushOut;
}

/**
 * Перетин відрізка з перешкодами, що блокують постріли.
 * Повертає частку t ∈ [0,1] до першого влучання, 1 якщо чисто.
 */
export function raycast(
  w: StaticWorld,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  shotsOnly = true,
  /** Перешкоди нижчі за це ігноруються: постріли над столами по дронах і з дронів. */
  minHeight = 0,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  let best = 1;
  const count = queryNear(
    w,
    Math.min(ax, bx),
    Math.min(ay, by),
    Math.max(ax, bx),
    Math.max(ay, by),
  );
  for (let qi = 0; qi < count; qi++) {
    const o = w.obstacles[w.query[qi]!]!;
    {
      if ((shotsOnly && !o.blocksShots) || o.src.height < minHeight) continue;
      let t: number;
      if (o.isCircle) {
        const fx = ax - o.x;
        const fy = ay - o.y;
        const a = dx * dx + dy * dy;
        const b = 2 * (fx * dx + fy * dy);
        const c = fx * fx + fy * fy - o.r * o.r;
        const disc = b * b - 4 * a * c;
        if (disc < 0 || a === 0) continue;
        t = (-b - Math.sqrt(disc)) / (2 * a);
        if (c < 0) t = 0;
      } else {
        const rx = ax - o.x;
        const ry = ay - o.y;
        const lax = rx * o.cos + ry * o.sin;
        const lay = -rx * o.sin + ry * o.cos;
        const ldx = dx * o.cos + dy * o.sin;
        const ldy = -dx * o.sin + dy * o.cos;
        let tmin = 0;
        let tmax = 1;
        if (Math.abs(ldx) < 1e-9) {
          if (lax < -o.hw || lax > o.hw) continue;
        } else {
          let t1 = (-o.hw - lax) / ldx;
          let t2 = (o.hw - lax) / ldx;
          if (t1 > t2) {
            const tmp = t1;
            t1 = t2;
            t2 = tmp;
          }
          tmin = Math.max(tmin, t1);
          tmax = Math.min(tmax, t2);
          if (tmin > tmax) continue;
        }
        if (Math.abs(ldy) < 1e-9) {
          if (lay < -o.hh || lay > o.hh) continue;
        } else {
          let t1 = (-o.hh - lay) / ldy;
          let t2 = (o.hh - lay) / ldy;
          if (t1 > t2) {
            const tmp = t1;
            t1 = t2;
            t2 = tmp;
          }
          tmin = Math.max(tmin, t1);
          tmax = Math.min(tmax, t2);
          if (tmin > tmax) continue;
        }
        t = tmin;
      }
      if (t >= 0 && t < best) best = t;
    }
  }
  return best;
}

export function hasLineOfSight(
  w: StaticWorld,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  minHeight = 0,
): boolean {
  return raycast(w, ax, ay, bx, by, true, minHeight) >= 1;
}
