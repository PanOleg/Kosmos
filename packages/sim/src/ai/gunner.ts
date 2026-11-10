import { GUNNER } from '../config/enemies';
import { hasLineOfSight, raycast, resolveCircle } from '../collision/world';
import type { Enemy } from '../entities/enemy';
import type { Player } from '../entities/player';
import { TEAM_ENEMY } from '../entities/projectile';
import { emit } from '../events';
import { secToTicks } from '../math';
import type { Game } from '../state';
import { spawnProjectile } from '../systems/combat';
import { steer, steerTo } from '../systems/enemies';

export const GUNNER_SEEK = 0;
export const GUNNER_HIDE = 1;
export const GUNNER_PEEK = 2;
export const GUNNER_RETURN = 3;
export const GUNNER_OPEN = 4;

/**
 * Стрілець живе ритмом: сховався → визирнув і прицілився (телеграф) → вистрілив → назад.
 * Автоприціл бачить його лише у вікні визирання — або коли гравець обійшов укриття збоку.
 * Обійдений Стрілець якийсь час лишається відкритим (нагорода за позицію), потім тікає.
 */
export function updateGunner(game: Game, e: Enemy, index: number): void {
  const p = e.target >= 0 ? game.state.players[e.target] : undefined;
  e.exposed = false;
  if (!p || p.down) return;
  const aggr = game.config.mods.aggression;
  const tick = game.state.tick;

  switch (e.ai) {
    case GUNNER_SEEK: {
      if (e.cover < 0 || (tick + index) % GUNNER.coverSearchEvery === 0) {
        if (!findCover(game, e, index, p)) {
          e.ai = GUNNER_OPEN;
          e.aiT = secToTicks(GUNNER.hide / aggr);
          return;
        }
      }
      steerTo(game, e, e.coverX, e.coverY);
      if (near(e, e.coverX, e.coverY, 0.35)) {
        e.ai = GUNNER_HIDE;
        e.aiT = secToTicks(GUNNER.hide / aggr);
        e.flank = 0;
      }
      return;
    }

    case GUNNER_HIDE: {
      holdAt(e, e.coverX, e.coverY);
      faceTo(e, p);
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      // Гравець бачить Стрільця з-за укриття: його обійшли. Лічильник терпіння — у flank.
      if (hasLineOfSight(game.world, e.x, e.y, p.x, p.y)) {
        e.flank += 1;
        if (e.flank > secToTicks(GUNNER.flankedPatience)) return relocate(e);
        // Обійдений все одно стріляє у звичному ритмі.
      } else e.flank = 0;
      if (d < GUNNER.coverMin - 2.5 || d > GUNNER.coverMax + 4) return relocate(e);
      if (--e.aiT > 0) return;
      if (!findPeek(game, e, p)) return relocate(e);
      e.ai = GUNNER_PEEK;
      e.aiT = secToTicks(GUNNER.peek);
      emit(game.events, 'enemyWindup', e.x, e.y, p.x, p.y, index, 2, GUNNER.aim);
      return;
    }

    case GUNNER_PEEK: {
      e.exposed = true;
      sidestep(e, e.peekX, e.peekY);
      faceTo(e, p);
      const total = secToTicks(GUNNER.peek);
      const fireAt = total - secToTicks(GUNNER.aim);
      if (e.aiT === fireAt) fire(game, e, index, p);
      if (--e.aiT <= 0) e.ai = GUNNER_RETURN;
      return;
    }

    case GUNNER_RETURN: {
      sidestep(e, e.coverX, e.coverY);
      if (near(e, e.coverX, e.coverY, 0.35)) {
        e.ai = GUNNER_HIDE;
        e.aiT = secToTicks(GUNNER.hide / aggr);
      }
      return;
    }

    case GUNNER_OPEN: {
      // Без укриття: кружляє на дистанції й стріляє тим самим ритмом. Завжди досяжний.
      e.exposed = true;
      const a = Math.atan2(e.y - p.y, e.x - p.x) + 0.35;
      steerTo(game, e, p.x + Math.cos(a) * GUNNER.openRange, p.y + Math.sin(a) * GUNNER.openRange);
      faceTo(e, p);
      if ((tick + index) % GUNNER.coverSearchEvery === 0 && findCover(game, e, index, p)) {
        e.ai = GUNNER_SEEK;
        return;
      }
      const aim = secToTicks(GUNNER.aim);
      if (e.aiT === aim) emit(game.events, 'enemyWindup', e.x, e.y, p.x, p.y, index, 2, GUNNER.aim);
      if (--e.aiT <= 0) {
        if (hasLineOfSight(game.world, e.x, e.y, p.x, p.y)) fire(game, e, index, p);
        e.aiT = secToTicks((GUNNER.hide + GUNNER.peek) / aggr);
      }
      return;
    }
  }
}

function relocate(e: Enemy): void {
  e.ai = GUNNER_SEEK;
  e.cover = -1;
  e.flank = 0;
}

function near(e: Enemy, x: number, y: number, r: number): boolean {
  return (e.x - x) ** 2 + (e.y - y) ** 2 <= r * r;
}

/**
 * Короткий крок уздовж укриття: прямо, без пошуку шляху. Широка перевірка проходу тут
 * хибно спрацьовує на стіну, вздовж якої йдемо, а ковзання resolveCircle й так веде.
 */
function sidestep(e: Enemy, x: number, y: number): void {
  const dx = x - e.x;
  const dy = y - e.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 0.08) {
    steer.x = 0;
    steer.y = 0;
    return;
  }
  // Сповільнення на останніх сантиметрах, щоб не тремтіти довкола точки.
  const k = GUNNER.peekSpeed * Math.min(1, d / 0.4);
  steer.x = (dx / d) * k;
  steer.y = (dy / d) * k;
}

function holdAt(e: Enemy, x: number, y: number): void {
  const dx = x - e.x;
  const dy = y - e.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 0.1) {
    steer.x = 0;
    steer.y = 0;
  } else {
    steer.x = (dx / d) * Math.min(1, d);
    steer.y = (dy / d) * Math.min(1, d);
  }
}

function faceTo(e: Enemy, p: Player): void {
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const l = Math.sqrt(dx * dx + dy * dy) || 1;
  e.fx = dx / l;
  e.fy = dy / l;
}

function fire(game: Game, e: Enemy, index: number, p: Player): void {
  if (!hasLineOfSight(game.world, e.x, e.y, p.x, p.y)) return;
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const l = Math.sqrt(dx * dx + dy * dy) || 1;
  // Без упередження: постріл у поточну позицію — рух убік ухиляється, ривок гарантовано.
  spawnProjectile(
    game,
    TEAM_ENEMY,
    index,
    e.x + (dx / l) * 0.7,
    e.y + (dy / l) * 0.7,
    dx / l,
    dy / l,
    GUNNER.projectileSpeed,
    GUNNER.range,
    e.damage,
    0,
    GUNNER.projectileRadius,
  );
  emit(game.events, 'enemyShot', e.x, e.y, dx / l, dy / l, index);
}

function claimedByOther(game: Game, self: number, x: number, y: number): boolean {
  const en = game.state.enemies;
  const r2 = GUNNER.coverSpacing * GUNNER.coverSpacing;
  for (let i = 0; i < en.length; i++) {
    if (i === self) continue;
    const o = en[i]!;
    if (!o.alive || o.type !== 'gunner' || o.cover < 0) continue;
    if ((o.coverX - x) ** 2 + (o.coverY - y) ** 2 < r2) return true;
  }
  return false;
}

/** Найближча до Стрільця точка укриття, закрита від цілі, з якої можна визирнути. */
function findCover(game: Game, e: Enemy, index: number, p: Player): boolean {
  const cp = game.cover;
  const minD2 = GUNNER.coverMin * GUNNER.coverMin;
  const maxD2 = GUNNER.coverMax * GUNNER.coverMax;
  const ideal = (GUNNER.coverMin + GUNNER.coverMax) / 2;
  const scoreOf = (x: number, y: number, pd: number) =>
    Math.sqrt((x - e.x) ** 2 + (y - e.y) ** 2) + Math.abs(pd - ideal) * 1.5;
  let best = -1;
  let bestScore = Infinity;
  // Поточне укриття, якщо ще годиться, лишається, поки інше не краще суттєво: без смикання.
  if (e.cover >= 0) {
    const x = cp.x[e.cover]!;
    const y = cp.y[e.cover]!;
    const pd2 = (x - p.x) ** 2 + (y - p.y) ** 2;
    if (
      pd2 >= minD2 &&
      pd2 <= maxD2 &&
      raycast(game.world, x, y, p.x, p.y, true) < 1 &&
      peekFrom(game, x, y, p)
    ) {
      best = e.cover;
      bestScore = scoreOf(x, y, Math.sqrt(pd2)) - GUNNER.coverHysteresis;
    }
  }
  for (let i = 0; i < cp.count; i++) {
    const x = cp.x[i]!;
    const y = cp.y[i]!;
    const pd2 = (x - p.x) ** 2 + (y - p.y) ** 2;
    if (pd2 < minD2 || pd2 > maxD2) continue;
    const score = scoreOf(x, y, Math.sqrt(pd2));
    if (score >= bestScore) continue;
    // Дорогі перевірки — лише для кандидатів, що вже кращі за знайдене.
    if (raycast(game.world, x, y, p.x, p.y, true) >= 1) continue;
    if (claimedByOther(game, index, x, y)) continue;
    if (!peekFrom(game, x, y, p)) continue;
    best = i;
    bestScore = score;
  }
  if (best < 0) {
    e.cover = -1;
    return false;
  }
  e.cover = best;
  e.coverX = cp.x[best]!;
  e.coverY = cp.y[best]!;
  peekFrom(game, e.coverX, e.coverY, p);
  e.peekX = peek.x;
  e.peekY = peek.y;
  return true;
}

function findPeek(game: Game, e: Enemy, p: Player): boolean {
  if (!peekFrom(game, e.coverX, e.coverY, p)) return false;
  e.peekX = peek.x;
  e.peekY = peek.y;
  return true;
}

const peek = { x: 0, y: 0 };
const PEEK_OFFSETS = [1.0, -1.0, 1.6, -1.6, 2.2, -2.2];

/** Крок убік від точки укриття, перпендикулярно до цілі, до першого місця з видимістю. */
function peekFrom(game: Game, x: number, y: number, p: Player): boolean {
  const dx = p.x - x;
  const dy = p.y - y;
  const l = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / l;
  const ny = dx / l;
  for (const s of PEEK_OFFSETS) {
    const cx = x + nx * s;
    const cy = y + ny * s;
    const r = resolveCircle(game.world, cx, cy, GUNNER.radius);
    if ((r.x - cx) ** 2 + (r.y - cy) ** 2 > 0.01) continue;
    if (!hasLineOfSight(game.world, cx, cy, p.x, p.y)) continue;
    peek.x = cx;
    peek.y = cy;
    return true;
  }
  return false;
}
