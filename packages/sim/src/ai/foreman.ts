import { FOREMAN, SCOUT } from '../config/enemies';
import type { Enemy } from '../entities/enemy';
import { emit } from '../events';
import { secToTicks } from '../math';
import { randInt, randRange } from '../rng';
import type { Game } from '../state';
import { damagePlayer } from '../systems/damage';
import { spawnEnemy, steer, steerTo } from '../systems/enemies';
import { placeProp } from '../systems/props';
import { resolveCircle } from '../collision/world';

export const FOREMAN_WALK = 0;
export const FOREMAN_STRIKE = 1;
/** Звір (ліс): стрибок у позначену зону — та сама зона й попередження, що в удару. */
export const FOREMAN_LEAP = 2;

/**
 * Прораб (міні-бос): підходить і б'є кранами по зоні перед собою (підсвічена 1.2 с);
 * раз на 8 с ставить укриття або турель, раз на 12 с кличе Скаутів.
 * Репетиція фіналу: його смерть скасовує решту підкріплень хвилі.
 */
export function updateForeman(game: Game, e: Enemy, index: number): void {
  const s = game.state;
  const p = e.target >= 0 ? s.players[e.target] : undefined;
  if (!p || p.down) return;
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  const aggr = game.config.mods.aggression;

  const beast = game.config.map.beasts === true;
  // Будівництво (у звіра — стрибок) і виклик ідуть незалежно від удару.
  e.cd++;
  if (!beast && e.cd >= secToTicks(FOREMAN.buildEvery / aggr)) {
    e.cd = 0;
    build(game, e, p.x, p.y);
  }
  if (++e.t2 >= secToTicks(FOREMAN.summonEvery / aggr)) {
    e.t2 = 0;
    if (beast) {
      // Виття: зграя вибігає з двох воріт, а не з'являється поруч.
      const locks = game.config.map.airlocks;
      const first = randInt(s.rng, 0, locks.length - 1);
      for (let k = 0; k < FOREMAN.packCount; k++) {
        const a = locks[(first + (k % 2) * randInt(s.rng, 1, locks.length - 1)) % locks.length]!;
        const l = Math.hypot(a.x, a.y) || 1;
        const side = (Math.floor(k / 2) - 0.5) * 1.4;
        const i = spawnEnemy(
          game,
          'scout',
          a.x - (a.x / l) * 1.5 - (a.y / l) * side,
          a.y - (a.y / l) * 1.5 + (a.x / l) * side,
        );
        if (i >= 0) s.enemies[i]!.speed = SCOUT.speed * game.config.mods.enemySpeed;
      }
    } else
      for (let k = 0; k < FOREMAN.summonCount; k++) {
        const a = randRange(s.rng, 0, Math.PI * 2);
        const i = spawnEnemy(game, 'scout', e.x + Math.cos(a) * 2, e.y + Math.sin(a) * 2);
        if (i >= 0) s.enemies[i]!.speed = SCOUT.speed * game.config.mods.enemySpeed;
      }
    emit(game.events, 'enemyWindup', e.x, e.y, 0, 0, index, 7, 0);
  }

  if (e.ai === FOREMAN_LEAP) {
    steer.x = 0;
    steer.y = 0;
    if (++e.aiT >= secToTicks(FOREMAN.strikeWarn)) {
      // Приземлення в позначену зону: хто не вийшов — отримує удар.
      const c = resolveCircle(game.world, e.tx, e.ty, e.radius);
      e.x = e.px = c.x;
      e.y = e.py = c.y;
      const r2 = FOREMAN.strikeRadius * FOREMAN.strikeRadius;
      for (const o of s.players)
        if (!o.down && (o.x - e.tx) ** 2 + (o.y - e.ty) ** 2 <= r2)
          damagePlayer(game, o, e.damage, e.tx, e.ty);
      emit(game.events, 'craneHit', e.tx, e.ty, 0, 0, index, 0, FOREMAN.strikeRadius);
      e.ai = FOREMAN_WALK;
      e.aiT = 0;
    }
    return;
  }

  if (e.ai === FOREMAN_STRIKE) {
    steer.x = 0;
    steer.y = 0;
    if (++e.aiT >= secToTicks(FOREMAN.strikeWarn)) {
      const r2 = FOREMAN.strikeRadius * FOREMAN.strikeRadius;
      for (const o of s.players)
        if (!o.down && (o.x - e.tx) ** 2 + (o.y - e.ty) ** 2 <= r2)
          damagePlayer(game, o, e.damage, e.tx, e.ty);
      emit(game.events, 'craneHit', e.tx, e.ty, 0, 0, index, 0, FOREMAN.strikeRadius);
      e.ai = FOREMAN_WALK;
      e.aiT = 0;
    }
    return;
  }

  e.fx = dx / d;
  e.fy = dy / d;
  if (beast && e.cd >= secToTicks(FOREMAN.leapEvery / aggr) && d > FOREMAN.leapMin) {
    e.cd = 0;
    e.ai = FOREMAN_LEAP;
    e.aiT = 0;
    // Ціль фіксується на початку замаху — із зони можна вийти.
    e.tx = p.x;
    e.ty = p.y;
    emit(game.events, 'craneWarn', e.tx, e.ty, 0, 0, index, 0, FOREMAN.strikeWarn);
    steer.x = 0;
    steer.y = 0;
    return;
  }
  if (d > FOREMAN.approach) steerTo(game, e, p.x, p.y);
  else {
    steer.x = 0;
    steer.y = 0;
  }
  if (
    ++e.aiT >= secToTicks(FOREMAN.strikeEvery / aggr) &&
    d < FOREMAN.strikeRange + FOREMAN.strikeRadius * 0.5
  ) {
    e.ai = FOREMAN_STRIKE;
    e.aiT = 0;
    // Зона фіксується на початку замаху — з неї можна вийти.
    e.tx = e.x + e.fx * FOREMAN.strikeOffset;
    e.ty = e.y + e.fy * FOREMAN.strikeOffset;
    emit(game.events, 'craneWarn', e.tx, e.ty, 0, 0, index, 0, FOREMAN.strikeWarn);
  }
}

/** Укриття або турель між собою й ціллю, по черзі; турелей не більше двох за хвилю. */
function build(game: Game, e: Enemy, px: number, py: number): void {
  const w = game.state.wave;
  const dx = px - e.x;
  const dy = py - e.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  // Убік від прямої на гравця: укриття не має замуровувати його самого.
  const side = (w.builds % 2 === 0 ? 1 : -1) * 2.5;
  let x = e.x + (dx / d) * 2.5 - (dy / d) * side;
  let y = e.y + (dy / d) * 2.5 + (dx / d) * side;
  // Не всередину клумби чи контейнера: виштовхуємо на вільне місце; не вийшло — не будує.
  const r = resolveCircle(game.world, x, y, 1.2);
  x = r.x;
  y = r.y;
  const check = resolveCircle(game.world, x, y, 1.2);
  if ((check.x - x) ** 2 + (check.y - y) ** 2 > 0.01) return;
  const turret = w.builds % 2 === 1 && w.turretsPlaced < FOREMAN.maxTurrets;
  w.builds++;
  if (turret) {
    if (spawnEnemy(game, 'turret', x, y) >= 0) w.turretsPlaced++;
  } else placeProp(game, x, y, Math.atan2(dy, dx) + Math.PI / 2);
}
