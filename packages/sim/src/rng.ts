/** mulberry32: стан — одне uint32, тому весь генератор серіалізується як число в GameState. */
export interface RngState {
  s: number;
}

export function createRng(seed: number): RngState {
  return { s: seed >>> 0 || 0x9e3779b9 };
}

/** [0, 1) */
export function rand(r: RngState): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randRange(r: RngState, min: number, max: number): number {
  return min + (max - min) * rand(r);
}

export function randInt(r: RngState, minIncl: number, maxIncl: number): number {
  return minIncl + Math.floor(rand(r) * (maxIncl - minIncl + 1));
}
