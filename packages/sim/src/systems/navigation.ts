import { queryNear, type StaticWorld } from '../collision/world';
import type { GameState } from '../state';

/**
 * Поле відстаней до найближчого живого гравця (Дейкстра з кількох джерел) на сітці 1 м.
 * Ворог, що не бачить цілі напряму, спускається по градієнту — обходить контейнери й стіни.
 * Перераховується раз на кілька тиків: гравці за цей час зсуваються менше клітинки-двох.
 */
export interface NavField {
  cell: number;
  half: number;
  n: number;
  blocked: Uint8Array;
  dist: Float32Array;
  heap: Int32Array;
  heapSize: number;
}

const INF = 1e9;

export function buildNav(world: StaticWorld, inflate: number, cell = 1): NavField {
  const half = world.radius + 1;
  const n = Math.ceil((half * 2) / cell);
  const blocked = new Uint8Array(n * n);
  for (let gy = 0; gy < n; gy++) {
    for (let gx = 0; gx < n; gx++) {
      const x = -half + (gx + 0.5) * cell;
      const y = -half + (gy + 0.5) * cell;
      blocked[gy * n + gx] = pointBlocked(world, x, y, inflate) ? 1 : 0;
    }
  }
  return {
    cell,
    half,
    n,
    blocked,
    dist: new Float32Array(n * n).fill(INF),
    heap: new Int32Array(n * n * 16),
    heapSize: 0,
  };
}

function pointBlocked(w: StaticWorld, x: number, y: number, inflate: number): boolean {
  if (x * x + y * y > (w.radius - inflate) * (w.radius - inflate)) return true;
  const c = queryNear(w, x - inflate, y - inflate, x + inflate, y + inflate);
  for (let i = 0; i < c; i++) {
    const o = w.obstacles[w.query[i]!]!;
    if (o.isCircle) {
      const dx = x - o.x;
      const dy = y - o.y;
      if (dx * dx + dy * dy < (o.r + inflate) * (o.r + inflate)) return true;
    } else {
      const dx = x - o.x;
      const dy = y - o.y;
      const lx = Math.abs(dx * o.cos + dy * o.sin) - o.hw;
      const ly = Math.abs(-dx * o.sin + dy * o.cos) - o.hh;
      const ox = lx > 0 ? lx : 0;
      const oy = ly > 0 ? ly : 0;
      if (ox * ox + oy * oy < inflate * inflate) return true;
    }
  }
  return false;
}

/** Перерахунок прохідності клітинок у прямокутнику (поставили чи прибрали укриття). */
export function refreshNavArea(
  nav: NavField,
  world: StaticWorld,
  inflate: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): void {
  const n = nav.n;
  const x0 = Math.max(0, Math.floor((minX - inflate + nav.half) / nav.cell));
  const x1 = Math.min(n - 1, Math.floor((maxX + inflate + nav.half) / nav.cell));
  const y0 = Math.max(0, Math.floor((minY - inflate + nav.half) / nav.cell));
  const y1 = Math.min(n - 1, Math.floor((maxY + inflate + nav.half) / nav.cell));
  for (let gy = y0; gy <= y1; gy++)
    for (let gx = x0; gx <= x1; gx++) {
      const x = -nav.half + (gx + 0.5) * nav.cell;
      const y = -nav.half + (gy + 0.5) * nav.cell;
      nav.blocked[gy * n + gx] = pointBlocked(world, x, y, inflate) ? 1 : 0;
    }
}

export function navCell(nav: NavField, x: number, y: number): number {
  let gx = Math.floor((x + nav.half) / nav.cell);
  let gy = Math.floor((y + nav.half) / nav.cell);
  gx = gx < 0 ? 0 : gx >= nav.n ? nav.n - 1 : gx;
  gy = gy < 0 ? 0 : gy >= nav.n ? nav.n - 1 : gy;
  return gy * nav.n + gx;
}

// Купа з парами (dist*1024 цілим, cell) упакованими в два сусідні слоти.
function push(nav: NavField, d: number, c: number): void {
  const h = nav.heap;
  let i = nav.heapSize++;
  const key = Math.round(d * 1024);
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (h[p * 2]! <= key) break;
    h[i * 2] = h[p * 2]!;
    h[i * 2 + 1] = h[p * 2 + 1]!;
    i = p;
  }
  h[i * 2] = key;
  h[i * 2 + 1] = c;
}

function pop(nav: NavField): number {
  const h = nav.heap;
  const top = h[1]!;
  const last = --nav.heapSize;
  const lk = h[last * 2]!;
  const lc = h[last * 2 + 1]!;
  let i = 0;
  for (;;) {
    let c = i * 2 + 1;
    if (c >= last) break;
    if (c + 1 < last && h[(c + 1) * 2]! < h[c * 2]!) c++;
    if (h[c * 2]! >= lk) break;
    h[i * 2] = h[c * 2]!;
    h[i * 2 + 1] = h[c * 2 + 1]!;
    i = c;
  }
  h[i * 2] = lk;
  h[i * 2 + 1] = lc;
  return top;
}

const NX = [1, -1, 0, 0, 1, 1, -1, -1];
const NY = [0, 0, 1, -1, 1, -1, 1, -1];
const NC = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];

export function updateNav(nav: NavField, state: GameState): void {
  nav.dist.fill(INF);
  nav.heapSize = 0;
  for (const p of state.players) {
    if (p.down) continue;
    const c = navCell(nav, p.x, p.y);
    nav.dist[c] = 0;
    push(nav, 0, c);
  }
  propagate(nav);
}

/** Поле відстаней до однієї точки (навігація бота до вибраного ворога). */
export function navToPoint(nav: NavField, x: number, y: number): void {
  nav.dist.fill(INF);
  nav.heapSize = 0;
  const c = navCell(nav, x, y);
  nav.dist[c] = 0;
  push(nav, 0, c);
  propagate(nav);
}

/** Поле з тією ж сіткою прохідності, але власними відстанями. */
export function navSharingBlocked(src: NavField): NavField {
  return {
    ...src,
    dist: new Float32Array(src.dist.length),
    heap: new Int32Array(src.heap.length),
    heapSize: 0,
  };
}

function propagate(nav: NavField): void {
  const { n, dist, blocked } = nav;
  while (nav.heapSize > 0) {
    const c = pop(nav);
    const d = dist[c]!;
    const cx = c % n;
    const cy = (c - cx) / n;
    for (let k = 0; k < 8; k++) {
      const x = cx + NX[k]!;
      const y = cy + NY[k]!;
      if (x < 0 || y < 0 || x >= n || y >= n) continue;
      const nc = y * n + x;
      if (blocked[nc]) continue;
      // Діагональ лише якщо обидва ортогональні сусіди вільні: не різати кути.
      if (k >= 4 && (blocked[cy * n + x] || blocked[y * n + cx])) continue;
      const nd = d + NC[k]!;
      if (nd < dist[nc]!) {
        dist[nc] = nd;
        if (nav.heapSize < nav.heap.length / 2) push(nav, nd, nc);
      }
    }
  }
}

/** Напрям униз по полю з точки; повертає false, якщо поле тут не визначене. */
export const navDir = { x: 0, y: 0 };
export function sampleNav(nav: NavField, x: number, y: number): boolean {
  const n = nav.n;
  const c = navCell(nav, x, y);
  const cx = c % n;
  const cy = (c - cx) / n;
  let best = nav.dist[c]!;
  let bx = 0;
  let by = 0;
  let found = false;
  for (let k = 0; k < 8; k++) {
    const gx = cx + NX[k]!;
    const gy = cy + NY[k]!;
    if (gx < 0 || gy < 0 || gx >= n || gy >= n) continue;
    const nc = gy * n + gx;
    if (nav.blocked[nc]) continue;
    if (k >= 4 && (nav.blocked[cy * n + gx] || nav.blocked[gy * n + cx])) continue;
    const d = nav.dist[nc]!;
    if (d < best) {
      best = d;
      bx = gx;
      by = gy;
      found = true;
    }
  }
  if (!found) return false;
  // Ціль — центр сусідньої клітинки.
  const tx = -nav.half + (bx + 0.5) * nav.cell - x;
  const ty = -nav.half + (by + 0.5) * nav.cell - y;
  const l = Math.sqrt(tx * tx + ty * ty) || 1;
  navDir.x = tx / l;
  navDir.y = ty / l;
  return true;
}
