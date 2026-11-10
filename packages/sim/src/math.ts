export const DT = 1 / 60;
export const TICKS_PER_SEC = 60;

export function secToTicks(s: number): number {
  return Math.round(s * TICKS_PER_SEC);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function len(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

/** Найкоротша різниця кутів у (-π, π]. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}
