import { resolveCircle, type StaticWorld } from './world';

/**
 * Точки укриття: обхід периметра кожної перешкоди, що блокує постріли, з кроком ~1.5 м,
 * на відстані радіуса ворога від поверхні. Готуються один раз на карту.
 */
export interface CoverPoints {
  x: Float32Array;
  y: Float32Array;
  /** Індекс перешкоди, за якою точка. */
  obstacle: Int16Array;
  count: number;
}

export function buildCover(
  w: StaticWorld,
  offset: number,
  minHeight: number,
  spacing = 1.5,
): CoverPoints {
  const xs: number[] = [];
  const ys: number[] = [];
  const os: number[] = [];
  for (const o of w.obstacles) {
    if (!o.active || !o.blocksShots || o.src.height < minHeight || o.src.tag === 'core') continue;
    if (o.isCircle) {
      const r = o.r + offset;
      const n = Math.max(6, Math.round((Math.PI * 2 * r) / spacing));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        xs.push(o.x + Math.cos(a) * r);
        ys.push(o.y + Math.sin(a) * r);
        os.push(o.index);
      }
    } else {
      const hw = o.hw + offset;
      const hh = o.hh + offset;
      const nx = Math.max(1, Math.round((hw * 2) / spacing));
      const ny = Math.max(1, Math.round((hh * 2) / spacing));
      const push = (lx: number, ly: number) => {
        xs.push(o.x + lx * o.cos - ly * o.sin);
        ys.push(o.y + lx * o.sin + ly * o.cos);
        os.push(o.index);
      };
      for (let i = 0; i <= nx; i++) {
        const lx = -hw + (i * hw * 2) / nx;
        push(lx, -hh);
        push(lx, hh);
      }
      for (let i = 1; i < ny; i++) {
        const ly = -hh + (i * hh * 2) / ny;
        push(-hw, ly);
        push(hw, ly);
      }
    }
  }
  // Точки поза ареною або всередині іншої перешкоди відкидаємо.
  const keepX: number[] = [];
  const keepY: number[] = [];
  const keepO: number[] = [];
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i]!;
    const y = ys[i]!;
    if (x * x + y * y > (w.radius - offset - 0.5) ** 2) continue;
    const r = resolveCircle(w, x, y, offset * 0.9);
    if ((r.x - x) ** 2 + (r.y - y) ** 2 > 0.0025) continue;
    keepX.push(x);
    keepY.push(y);
    keepO.push(os[i]!);
  }
  return {
    x: Float32Array.from(keepX),
    y: Float32Array.from(keepY),
    obstacle: Int16Array.from(keepO),
    count: keepX.length,
  };
}
