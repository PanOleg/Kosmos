import { clearHash, insertHash } from '../collision/spatial';
import { raycast, resolveCircle } from '../collision/world';
import { AIR_TYPES, CROWD, ENEMIES, type EnemyType } from '../config/enemies';
import type { Enemy } from '../entities/enemy';
import { emit } from '../events';
import { DT } from '../math';
import { randRange } from '../rng';
import type { Game } from '../state';
import { updateScout } from '../ai/scout';
import { sampleNav, navDir, updateNav } from './navigation';
import { updateGunner } from '../ai/gunner';
import { updateWasp } from '../ai/wasp';
import { updateKamikaze } from '../ai/kamikaze';
import { updateSniper } from '../ai/sniper';
import { updateSwarm, SWARM_GROUPS, swarmCenters } from '../ai/swarm';

/** Висота, з якої дрон вилітає з вентиляційного люка й знижується до своєї. */
const DRONE_SPAWN_ALT = 6;
/** Швидкість зміни висоти дрона, м/с: спуск із люка, падіння від ЕМІ, підйом після. */
const DRONE_CLIMB = 4;
/** Висота заглушеного дрона: лежить на підлозі. */
const DRONE_GROUNDED_ALT = 0.4;

/** Бажаний напрям руху від AI (одиничний або нуль), множиться на швидкість ворога. */
export const steer = { x: 0, y: 0 };

const NAV_EVERY = 10;

export function spawnEnemy(game: Game, type: EnemyType, x: number, y: number, group = -1): number {
  const s = game.state;
  for (let i = 0; i < s.enemies.length; i++) {
    const e = s.enemies[i]!;
    if (e.alive) continue;
    const def = ENEMIES[type];
    const m = game.config.mods;
    e.alive = true;
    e.gen++;
    e.type = type;
    e.x = e.px = x;
    e.y = e.py = y;
    e.vx = e.vy = 0;
    e.fx = -x;
    e.fy = -y;
    const l = Math.sqrt(e.fx * e.fx + e.fy * e.fy) || 1;
    e.fx /= l;
    e.fy /= l;
    e.radius = def.radius;
    e.hp = e.maxHp = Math.round(def.hp * m.enemyHp);
    e.speed = def.speed * m.enemySpeed;
    e.damage = def.damage * m.enemyDamage;
    e.ai = 0;
    e.aiT = 0;
    e.target = -1;
    e.flank = randRange(s.rng, 0, Math.PI * 2);
    e.cover = -1;
    e.stagger = 0;
    e.exposed = false;
    e.stun = 0;
    e.air = AIR_TYPES.has(type);
    e.alt = e.air ? DRONE_SPAWN_ALT : 0;
    e.group = group;
    e.shots = 0;
    e.tx = x;
    e.ty = y;
    s.enemiesAlive++;
    emit(game.events, 'spawn', x, y, 0, 0, i);
    return i;
  }
  return -1;
}

/**
 * Чи пролізе тіло радіуса r по прямій: центр і два бокові промені на ширину тіла.
 * Тонкий промінь «бачить» прохід повз кут, у який тіло потім упирається назавжди.
 * Скло лабораторії кулі пропускає, а тіла — ні, тому тут shotsOnly=false.
 */
export function canWalk(
  game: Game,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r = 0.5,
): boolean {
  const w = game.world;
  if (raycast(w, ax, ay, bx, by, false) < 1) return false;
  const dx = bx - ax;
  const dy = by - ay;
  const l = Math.sqrt(dx * dx + dy * dy);
  if (l < 1e-6) return true;
  const nx = (-dy / l) * r;
  const ny = (dx / l) * r;
  return (
    raycast(w, ax + nx, ay + ny, bx + nx, by + ny, false) >= 1 &&
    raycast(w, ax - nx, ay - ny, bx - nx, by - ny, false) >= 1
  );
}

/**
 * Рух до точки: напряму, якщо прохід вільний, інакше по полю навігації.
 * Поле веде до найближчого гравця, а всі цілі ворогів (укриття, кільце оточення) лежать
 * поруч із гравцем — тож спуск по ньому рано чи пізно відкриває пряму дорогу до точки.
 */
export function steerTo(game: Game, e: Enemy, tx: number, ty: number): void {
  if (canWalk(game, e.x, e.y, tx, ty, e.radius)) {
    const dx = tx - e.x;
    const dy = ty - e.y;
    const l = Math.sqrt(dx * dx + dy * dy) || 1;
    steer.x = dx / l;
    steer.y = dy / l;
    return;
  }
  if (sampleNav(game.nav, e.x, e.y)) {
    steer.x = navDir.x;
    steer.y = navDir.y;
  } else {
    steer.x = 0;
    steer.y = 0;
  }
}

function pickTarget(game: Game, e: Enemy): number {
  let best = -1;
  let bestD = Infinity;
  for (const p of game.state.players) {
    if (p.down) continue;
    const d = (p.x - e.x) * (p.x - e.x) + (p.y - e.y) * (p.y - e.y);
    if (d < bestD) {
      bestD = d;
      best = p.slot;
    }
  }
  return best;
}

export function updateEnemies(game: Game): void {
  const s = game.state;
  if (s.tick % NAV_EVERY === 0) updateNav(game.nav, s);

  const h = game.hash;
  clearHash(h);
  for (let i = 0; i < s.enemies.length; i++) {
    const e = s.enemies[i]!;
    if (e.alive) insertHash(h, i, e.x, e.y);
  }

  swarmCenters(game);

  for (let i = 0; i < s.enemies.length; i++) {
    const e = s.enemies[i]!;
    if (!e.alive) continue;
    e.px = e.x;
    e.py = e.y;
    // Ціль перевибирається рідко й розкидано за індексом — не всі разом в одному тику.
    if ((s.tick + i) % 30 === 0 || e.target < 0 || s.players[e.target]?.down)
      e.target = pickTarget(game, e);

    steer.x = 0;
    steer.y = 0;
    // Заглушений ЕМІ: стоїть, не атакує, вразливий (автоприціл бере його охочіше).
    if (e.stun > 0) {
      e.stun--;
      e.exposed = true;
      // Заглушений дрон падає на підлогу (DECISIONS.md, п. 29).
      if (e.air) e.alt = Math.max(DRONE_GROUNDED_ALT, e.alt - DRONE_CLIMB * 2 * DT);
    } else {
      if (e.air) {
        const cruise = (ENEMIES[e.type] as { altitude?: number }).altitude ?? 2;
        const d = cruise - e.alt;
        e.alt += Math.sign(d) * Math.min(Math.abs(d), DRONE_CLIMB * DT);
      }
      switch (e.type) {
        case 'scout':
          updateScout(game, e, i);
          break;
        case 'gunner':
          updateGunner(game, e, i);
          break;
        case 'wasp':
          updateWasp(game, e, i);
          break;
        case 'kamikaze':
          updateKamikaze(game, e, i);
          break;
        case 'sniper':
          updateSniper(game, e, i);
          break;
        case 'swarm':
          updateSwarm(game, e, i);
          break;
      }
      if (!e.alive) continue;
    }

    let wx = steer.x * e.speed;
    let wy = steer.y * e.speed;
    if (wx !== 0 || wy !== 0) {
      e.fx = steer.x;
      e.fy = steer.y;
    }

    // Розштовхування: сусіди з тієї ж і суміжних клітинок.
    let sx = 0;
    let sy = 0;
    const cx = Math.floor((e.x + h.half) / h.cell);
    const cy = Math.floor((e.y + h.half) / h.cell);
    for (let oy = -1; oy <= 1; oy++) {
      const gy = cy + oy;
      if (gy < 0 || gy >= h.n) continue;
      for (let ox = -1; ox <= 1; ox++) {
        const gx = cx + ox;
        if (gx < 0 || gx >= h.n) continue;
        for (let j = h.head[gy * h.n + gx]!; j >= 0; j = h.next[j]!) {
          if (j === i) continue;
          const o = s.enemies[j]!;
          // Дрони розштовхуються лише з дронами, наземні — з наземними.
          if (o.air !== e.air) continue;
          const dx = e.x - o.x;
          const dy = e.y - o.y;
          const min = (e.radius + o.radius) * CROWD.separation;
          const d2 = dx * dx + dy * dy;
          if (d2 >= min * min || d2 < 1e-8) continue;
          const d = Math.sqrt(d2);
          const k = (min - d) / min;
          sx += (dx / d) * k;
          sy += (dy / d) * k;
        }
      }
    }
    wx += sx * CROWD.strength;
    wy += sy * CROWD.strength;

    if (e.stagger > 0) {
      e.stagger--;
      // Під час відкидання AI не керує: швидкість лише згасає.
      e.vx *= 0.85;
      e.vy *= 0.85;
    } else {
      const k = 1 - Math.exp(-DT * 12);
      e.vx += (wx - e.vx) * k;
      e.vy += (wy - e.vy) * k;
    }

    if (e.air) {
      // Дрони пролітають над перешкодами; тримаються лише в межах арени.
      e.x += e.vx * DT;
      e.y += e.vy * DT;
      const maxR = game.world.radius - e.radius - 0.5;
      const d2 = e.x * e.x + e.y * e.y;
      if (d2 > maxR * maxR) {
        const k = maxR / Math.sqrt(d2);
        e.x *= k;
        e.y *= k;
      }
    } else {
      const r = resolveCircle(game.world, e.x + e.vx * DT, e.y + e.vy * DT, e.radius);
      e.x = r.x;
      e.y = r.y;
    }
  }
}

/** Напрям до точки для дрона: по прямій, перешкоди не заважають. */
export function flyTo(e: Enemy, tx: number, ty: number, k = 1): void {
  const dx = tx - e.x;
  const dy = ty - e.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 0.05) {
    steer.x = 0;
    steer.y = 0;
    return;
  }
  // Сповільнення біля точки, щоб не тремтіти навколо неї.
  const m = k * Math.min(1, d / 1.5);
  steer.x = (dx / d) * m;
  steer.y = (dy / d) * m;
}

export { SWARM_GROUPS };
