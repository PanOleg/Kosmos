import { TEAM_ENEMY, TEAM_PLAYER, type Projectile } from '../entities/projectile';
import { raycast } from '../collision/world';
import { emit } from '../events';
import { DT, TICKS_PER_SEC } from '../math';
import { randRange } from '../rng';
import type { Game } from '../state';
import { damageEnemy, damagePlayer } from './damage';
import { ABILITIES, type ArcDef } from '../config/classes';
import { hasLineOfSight } from '../collision/world';
import { damageBarrier, segBarrier } from './abilities';

const arcHit = new Int32Array(8);

/**
 * Електродуга Техніка: миттєво б'є ціль і перескакує на найближчих сусідів (без повторів),
 * кожен стрибок слабший. Події 'arc' — відрізки для рендеру блискавки.
 */
function fireArc(
  game: Game,
  slot: number,
  first: number,
  damage: number,
  knock: number,
  arc: ArcDef,
): void {
  const s = game.state;
  const h = game.hash;
  const p = s.players[slot]!;
  let fromX = p.x + p.fx * 0.7;
  let fromY = p.y + p.fy * 0.7;
  let cur = first;
  let dmg = damage;
  let n = 0;
  const r2 = arc.jumpRange * arc.jumpRange;
  for (let jump = 0; jump <= arc.jumps && cur >= 0; jump++) {
    const e = s.enemies[cur]!;
    arcHit[n++] = cur;
    emit(game.events, 'arc', fromX, fromY, e.x, e.y, slot, jump);
    const dx = e.x - fromX;
    const dy = e.y - fromY;
    const l = Math.sqrt(dx * dx + dy * dy) || 1;
    const ex = e.x;
    const ey = e.y;
    damageEnemy(game, e, cur, dmg, dx / l, dy / l, knock, slot);
    fromX = ex;
    fromY = ey;
    dmg *= arc.falloff;
    // Наступна ціль — найближча неуражена в радіусі стрибка з прямою видимістю.
    let best = -1;
    let bestD = r2;
    const x0 = Math.max(0, Math.floor((ex - arc.jumpRange + h.half) / h.cell));
    const x1 = Math.min(h.n - 1, Math.floor((ex + arc.jumpRange + h.half) / h.cell));
    const y0 = Math.max(0, Math.floor((ey - arc.jumpRange + h.half) / h.cell));
    const y1 = Math.min(h.n - 1, Math.floor((ey + arc.jumpRange + h.half) / h.cell));
    for (let gy = y0; gy <= y1; gy++)
      for (let gx = x0; gx <= x1; gx++)
        for (let j = h.head[gy * h.n + gx]!; j >= 0; j = h.next[j]!) {
          const o = s.enemies[j]!;
          if (!o.alive) continue;
          let seen = false;
          for (let k = 0; k < n; k++) if (arcHit[k] === j) seen = true;
          if (seen) continue;
          const d2 = (o.x - ex) ** 2 + (o.y - ey) ** 2;
          if (d2 < bestD && hasLineOfSight(game.world, ex, ey, o.x, o.y)) {
            bestD = d2;
            best = j;
          }
        }
    cur = best;
  }
  emit(game.events, 'shot', p.x + p.fx * 0.7, p.y + p.fy * 0.7, p.fx, p.fy, slot, 1, 1);
}

export function spawnProjectile(
  game: Game,
  team: number,
  owner: number,
  x: number,
  y: number,
  dx: number,
  dy: number,
  speed: number,
  range: number,
  damage: number,
  knockback: number,
  radius: number,
): Projectile | null {
  const pool = game.state.projectiles;
  for (let i = 0; i < pool.length; i++) {
    const b = pool[i]!;
    if (b.alive) continue;
    b.alive = true;
    b.team = team;
    b.owner = owner;
    b.x = b.px = x;
    b.y = b.py = y;
    b.vx = dx * speed;
    b.vy = dy * speed;
    b.life = Math.ceil((range / speed) * TICKS_PER_SEC);
    b.damage = damage;
    b.knockback = knockback;
    b.radius = radius;
    return b;
  }
  return null;
}

/** Автоматична стрільба по цілі автоприцілу з упередженням на швидкість цілі. */
export function updatePlayerFire(game: Game): void {
  const s = game.state;
  for (const p of s.players) {
    if (p.fireCd > 0) p.fireCd -= 1;
    if (p.down || p.target < 0 || p.dashT > 0) continue;
    const e = s.enemies[p.target]!;
    const w = game.config.classes[p.classId].weapon;
    let dx = e.x - p.x;
    let dy = e.y - p.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const t = d / w.projectileSpeed;
    dx += e.vx * t;
    dy += e.vy * t;
    const l = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= l;
    dy /= l;
    p.fx = dx;
    p.fy = dy;
    // Перегрів після перевантаження: ціль тримаємо, але не стріляємо.
    if (p.fireCd > 0 || p.overheatT > 0) continue;
    const overload = p.classId === 'assault' && p.abilityT > 0 ? ABILITIES.overload.rateMul : 1;
    p.fireCd += TICKS_PER_SEC / (w.rate * overload);
    const arc = game.config.classes[p.classId].arc;
    if (arc) {
      fireArc(game, p.slot, p.target, w.damage, w.knockback, arc);
      continue;
    }
    const muzzle = 0.7;
    const ox = p.x + dx * muzzle;
    const oy = p.y + dy * muzzle;
    for (let k = 0; k < w.pellets; k++) {
      const a =
        w.pellets > 1
          ? -w.spread / 2 + (w.spread * (k + randRange(s.rng, 0.2, 0.8))) / w.pellets
          : randRange(s.rng, -w.spread / 2, w.spread / 2);
      const c = Math.cos(a);
      const sn = Math.sin(a);
      spawnProjectile(
        game,
        TEAM_PLAYER,
        p.slot,
        ox,
        oy,
        dx * c - dy * sn,
        dx * sn + dy * c,
        w.projectileSpeed,
        w.range * 1.1,
        w.damage,
        w.knockback,
        0.12,
      );
    }
    emit(game.events, 'shot', ox, oy, dx, dy, p.slot, 0, w.pellets);
  }
}

/** t ∈ [0,1] уздовж відрізка a→b до першого торкання кола (cx, cy, r), або 2 якщо мимо. */
function segCircle(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  r: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const fx = ax - cx;
  const fy = ay - cy;
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy;
  if (a < 1e-12) return 2;
  const b = 2 * (fx * dx + fy * dy);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return 2;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : 2;
}

export function updateProjectiles(game: Game): void {
  const s = game.state;
  const h = game.hash;
  for (let i = 0; i < s.projectiles.length; i++) {
    const b = s.projectiles[i]!;
    if (!b.alive) continue;
    b.px = b.x;
    b.py = b.y;
    const nx = b.x + b.vx * DT;
    const ny = b.y + b.vy * DT;
    const wallT = raycast(game.world, b.x, b.y, nx, ny, true);
    let hitT = wallT;
    let hitIdx = -1;

    if (b.team === TEAM_PLAYER) {
      const x0 = Math.max(0, Math.floor((Math.min(b.x, nx) - 1 + h.half) / h.cell));
      const x1 = Math.min(h.n - 1, Math.floor((Math.max(b.x, nx) + 1 + h.half) / h.cell));
      const y0 = Math.max(0, Math.floor((Math.min(b.y, ny) - 1 + h.half) / h.cell));
      const y1 = Math.min(h.n - 1, Math.floor((Math.max(b.y, ny) + 1 + h.half) / h.cell));
      for (let gy = y0; gy <= y1; gy++)
        for (let gx = x0; gx <= x1; gx++)
          for (let j = h.head[gy * h.n + gx]!; j >= 0; j = h.next[j]!) {
            const e = s.enemies[j]!;
            if (!e.alive) continue;
            const t = segCircle(b.x, b.y, nx, ny, e.x, e.y, e.radius + b.radius);
            if (t < hitT) {
              hitT = t;
              hitIdx = j;
            }
          }
    } else {
      for (const p of s.players) {
        if (p.down) continue;
        const t = segCircle(b.x, b.y, nx, ny, p.x, p.y, game.config.player.radius + b.radius);
        if (t < hitT) {
          hitT = t;
          hitIdx = p.slot;
        }
      }
      // Бар'єр Інженера зупиняє ворожі кулі раніше за гравця.
      for (let k = 0; k < s.barriers.length; k++) {
        const bar = s.barriers[k]!;
        if (!bar.alive) continue;
        const t = segBarrier(bar, b.x, b.y, nx, ny);
        if (t < hitT) {
          hitT = t;
          hitIdx = -2 - k;
        }
      }
    }

    if (hitT < 1) {
      b.x = b.x + (nx - b.x) * hitT;
      b.y = b.y + (ny - b.y) * hitT;
      b.alive = false;
      const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 1;
      const kx = b.vx / sp;
      const ky = b.vy / sp;
      if (hitIdx <= -2) {
        damageBarrier(game, s.barriers[-2 - hitIdx]!, b.damage, b.x, b.y);
      } else if (hitIdx >= 0 && b.team === TEAM_PLAYER) {
        damageEnemy(game, s.enemies[hitIdx]!, hitIdx, b.damage, kx, ky, b.knockback, b.owner);
      } else if (hitIdx >= 0 && b.team === TEAM_ENEMY) {
        const p = s.players[hitIdx]!;
        // Ривок «пропускає» кулю крізь себе — невразливість, а не промах.
        if (p.invuln > 0) {
          b.alive = true;
          b.x = nx;
          b.y = ny;
        } else damagePlayer(game, p, b.damage, b.px, b.py);
      } else {
        emit(game.events, 'impact', b.x, b.y, kx, ky, b.team);
      }
      continue;
    }
    b.x = nx;
    b.y = ny;
    if (--b.life <= 0) b.alive = false;
  }
}
