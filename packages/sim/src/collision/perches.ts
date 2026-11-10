import { SPIDER } from '../config/enemies';
import type { StaticWorld } from './world';

/**
 * Опори Павука: точки вздовж зовнішньої стіни й верхівки високих перешкод (контейнери,
 * перегородки). Звідти він стрибає вниз. Готуються один раз на карту.
 */
export interface Perches {
  x: Float32Array;
  y: Float32Array;
  alt: Float32Array;
  count: number;
}

export function buildPerches(w: StaticWorld, spacing = 2.5): Perches {
  const xs: number[] = [];
  const ys: number[] = [];
  const alts: number[] = [];
  const r = w.radius - 0.7;
  const n = Math.round((Math.PI * 2 * r) / spacing);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    xs.push(Math.cos(a) * r);
    ys.push(Math.sin(a) * r);
    alts.push(SPIDER.perchAlt);
  }
  for (const o of w.obstacles) {
    if (o.src.height < 2 || o.src.tag === 'core') continue;
    xs.push(o.x);
    ys.push(o.y);
    alts.push(o.src.height + 0.15);
  }
  return {
    x: Float32Array.from(xs),
    y: Float32Array.from(ys),
    alt: Float32Array.from(alts),
    count: xs.length,
  };
}
