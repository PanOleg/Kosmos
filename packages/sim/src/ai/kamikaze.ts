import { KAMIKAZE } from '../config/enemies';
import type { Enemy } from '../entities/enemy';
import { emit } from '../events';
import { DT, secToTicks } from '../math';
import type { Game } from '../state';
import { damageBarrier, segBarrier } from '../systems/abilities';
import { damagePlayer } from '../systems/damage';
import { flyTo, steer } from '../systems/enemies';

export const KAMI_APPROACH = 0;
export const KAMI_WINDUP = 1;
export const KAMI_DIVE = 2;

/**
 * Камікадзе: підлітає, зависає з телеграфом (точка удару на підлозі), пікірує по прямій
 * і вибухає. Лобова броня робить його невразливим у лоб — збивати збоку, після ЕМІ
 * або підставити бар'єр Інженера. Ривок під час пікірування рятує.
 */
export function updateKamikaze(game: Game, e: Enemy, index: number): void {
  const p = e.target >= 0 ? game.state.players[e.target] : undefined;

  if (e.ai === KAMI_DIVE) {
    e.exposed = false;
    const dx = e.tx - e.x;
    const dy = e.ty - e.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const step = KAMIKAZE.diveSpeed * DT;
    // Бар'єр на шляху — вибух об нього.
    for (const b of game.state.barriers) {
      if (!b.alive) continue;
      if (segBarrier(b, e.x, e.y, e.x + e.fx * step * 1.5, e.y + e.fy * step * 1.5) <= 1) {
        damageBarrier(game, b, e.damage, e.x, e.y);
        explode(game, e, index, false);
        return;
      }
    }
    // Влучив у гравця по дорозі або долетів до точки.
    for (const o of game.state.players) {
      if (o.down) continue;
      if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 < (e.radius + game.config.player.radius) ** 2) {
        explode(game, e, index, true);
        return;
      }
    }
    // Долетів — або точка недосяжна (за межею арени, біля стіни): пікірування не триває вічно.
    if (d <= step || ++e.aiT > secToTicks(KAMIKAZE.maxDive)) {
      explode(game, e, index, true);
      return;
    }
    // Пікірування не керується AI-кермом: летить сам, по прямій.
    e.vx = e.fx * KAMIKAZE.diveSpeed;
    e.vy = e.fy * KAMIKAZE.diveSpeed;
    e.alt = Math.max(0.6, e.alt - 3 * DT);
    steer.x = e.fx;
    steer.y = e.fy;
    e.speed = KAMIKAZE.diveSpeed;
    return;
  }

  if (!p || p.down) return;
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  e.fx = dx / d;
  e.fy = dy / d;

  if (e.ai === KAMI_WINDUP) {
    // Телеграф: висить і доводить ціль; точку фіксує наприкінці замаху.
    e.tx = p.x + e.fx * 1.5;
    e.ty = p.y + e.fy * 1.5;
    if (++e.aiT >= secToTicks(KAMIKAZE.windup)) {
      e.ai = KAMI_DIVE;
      e.aiT = 0;
      const tx = e.tx - e.x;
      const ty = e.ty - e.y;
      const l = Math.sqrt(tx * tx + ty * ty) || 1;
      e.fx = tx / l;
      e.fy = ty / l;
      emit(game.events, 'enemyAttack', e.x, e.y, e.fx, e.fy, index, 3);
    }
    return;
  }

  flyTo(e, p.x, p.y, KAMIKAZE.approachSpeedMul);
  if (d < KAMIKAZE.diveRange) {
    e.ai = KAMI_WINDUP;
    e.aiT = 0;
    e.tx = p.x;
    e.ty = p.y;
    emit(game.events, 'enemyWindup', e.x, e.y, p.x, p.y, index, 3, KAMIKAZE.windup);
  }
}

function explode(game: Game, e: Enemy, index: number, hurtPlayers: boolean): void {
  const r2 = KAMIKAZE.blastRadius * KAMIKAZE.blastRadius;
  if (hurtPlayers)
    for (const p of game.state.players)
      if (!p.down && (p.x - e.x) ** 2 + (p.y - e.y) ** 2 <= r2)
        damagePlayer(game, p, e.damage, e.x, e.y);
  emit(game.events, 'explosion', e.x, e.y, 0, 0, index, 0, KAMIKAZE.blastRadius);
  // Підірвався сам — без деталей і без зарахування вбивства.
  e.alive = false;
  e.hp = 0;
  game.state.enemiesAlive--;
  for (const p of game.state.players) if (p.target === index) p.target = -1;
}
