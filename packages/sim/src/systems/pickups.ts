import { PICKUPS } from '../config/waves';
import { resolveCircle } from '../collision/world';
import { emit } from '../events';
import { DT, secToTicks } from '../math';
import { randRange } from '../rng';
import type { Game } from '../state';

export function dropParts(game: Game, x: number, y: number, count: number): void {
  const s = game.state;
  const total = count * s.wave.partsMul;
  // Дробовий залишок (рій, множники) накопичується й не губиться.
  s.partsCarry += total;
  let n = Math.floor(s.partsCarry);
  s.partsCarry -= n;
  for (let i = 0; i < s.pickups.length && n > 0; i++) {
    const p = s.pickups[i]!;
    if (p.alive) continue;
    const a = randRange(s.rng, 0, Math.PI * 2);
    const sp = randRange(s.rng, 0.4, 1) * PICKUPS.scatter;
    p.alive = true;
    p.x = p.px = x;
    p.y = p.py = y;
    p.vx = Math.cos(a) * sp;
    p.vy = Math.sin(a) * sp;
    p.value = 1;
    p.life = secToTicks(PICKUPS.life);
    p.magnet = -1;
    n--;
  }
}

export function updatePickups(game: Game): void {
  const s = game.state;
  const cfg = game.config.player;
  const grab2 = cfg.pickupRadius * cfg.pickupRadius;
  const lock2 = grab2 * cfg.pickupLockMul * cfg.pickupLockMul;
  for (const p of s.pickups) {
    if (!p.alive) continue;
    p.px = p.x;
    p.py = p.y;
    if (--p.life <= 0) {
      p.alive = false;
      continue;
    }
    // Магніт тримає одного гравця, доки той поруч: без перетягування між двома.
    // Під час «пилососа» після хвилі радіус необмежений.
    const vacuum = s.wave.phase === 'vacuum';
    const held = p.magnet >= 0 ? s.players[p.magnet] : undefined;
    if (!held || held.down || (!vacuum && (held.x - p.x) ** 2 + (held.y - p.y) ** 2 > lock2)) {
      p.magnet = -1;
      let bestD = vacuum ? Infinity : grab2;
      for (const pl of s.players) {
        if (pl.down) continue;
        const d = (pl.x - p.x) ** 2 + (pl.y - p.y) ** 2;
        if (d < bestD) {
          bestD = d;
          p.magnet = pl.slot;
        }
      }
    }
    if (p.magnet >= 0) {
      const pl = s.players[p.magnet]!;
      const dx = pl.x - p.x;
      const dy = pl.y - p.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d <= cfg.pickupTouch) {
        collect(game, p.magnet, p.value, p.x, p.y);
        p.alive = false;
        continue;
      }
      const sp = vacuum ? cfg.pickupMagnetSpeed * 1.6 : cfg.pickupMagnetSpeed;
      p.vx = (dx / d) * sp;
      p.vy = (dy / d) * sp;
    } else {
      p.vx *= 0.9;
      p.vy *= 0.9;
    }
    // Під час «пилососа» деталі летять до гравця над перешкодами: інакше застрягли б за бортиком.
    if (vacuum) {
      p.x += p.vx * DT;
      p.y += p.vy * DT;
      continue;
    }
    const r = resolveCircle(game.world, p.x + p.vx * DT, p.y + p.vy * DT, 0.2);
    p.x = r.x;
    p.y = r.y;
  }
}

function collect(game: Game, slot: number, value: number, x: number, y: number): void {
  const s = game.state;
  let alive = 0;
  for (const p of s.players) if (!p.down) alive++;
  const shared = alive > 1 ? value * PICKUPS.sharedFraction : 0;
  const picker = s.players[slot]!;
  picker.parts += value - shared;
  picker.stats.partsCollected += value;
  if (shared > 0) for (const p of s.players) if (!p.down) p.parts += shared / alive;
  emit(game.events, 'pickup', x, y, 0, 0, slot, 0, value);
}
