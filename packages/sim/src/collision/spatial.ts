/**
 * Динамічна сітка для ворогів: голови списків + next, перебудова щокроку без алокацій.
 * Покриває квадрат [-half, half]²; усе поза ним притискається до крайніх клітинок.
 */
export interface SpatialHash {
  cell: number;
  half: number;
  n: number;
  head: Int32Array;
  next: Int32Array;
}

export function createSpatialHash(half: number, cell: number, capacity: number): SpatialHash {
  const n = Math.ceil((half * 2) / cell);
  return {
    cell,
    half,
    n,
    head: new Int32Array(n * n).fill(-1),
    next: new Int32Array(capacity).fill(-1),
  };
}

export function cellOf(h: SpatialHash, v: number): number {
  const c = Math.floor((v + h.half) / h.cell);
  return c < 0 ? 0 : c >= h.n ? h.n - 1 : c;
}

export function clearHash(h: SpatialHash): void {
  h.head.fill(-1);
}

export function insertHash(h: SpatialHash, index: number, x: number, y: number): void {
  const k = cellOf(h, y) * h.n + cellOf(h, x);
  h.next[index] = h.head[k]!;
  h.head[k] = index;
}
