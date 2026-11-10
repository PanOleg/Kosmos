import { SCOUT } from '../config/enemies';
import { hasLineOfSight } from '../collision/world';
import type { Enemy } from '../entities/enemy';
import { emit } from '../events';
import { secToTicks } from '../math';
import type { Game } from '../state';
import { damagePlayer } from '../systems/damage';
import { steerTo, steer } from '../systems/enemies';

export const SCOUT_CHASE = 0;
export const SCOUT_WINDUP = 1;
export const SCOUT_RECOVER = 2;

/**
 * Скаут: біжить до найближчого гравця; близько — розходиться по колу (flank), щоб група
 * оточувала, а не йшла гуськом. Удар телеграфується замахом — ривок його повністю знімає.
 */
export function updateScout(game: Game, e: Enemy, index: number): void {
  const ps = game.state.players;
  const aggr = game.config.mods.aggression;
  const p = e.target >= 0 ? ps[e.target] : undefined;

  if (e.ai === SCOUT_WINDUP) {
    steer.x = 0;
    steer.y = 0;
    e.exposed = true;
    if (--e.aiT <= 0) {
      e.exposed = false;
      if (p && !p.down) {
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        if (dx * dx + dy * dy <= SCOUT.hitRange * SCOUT.hitRange)
          damagePlayer(game, p, e.damage, e.x, e.y);
        // Невеликий випад уперед: удар читається як рух, а не як магія.
        const l = Math.sqrt(dx * dx + dy * dy) || 1;
        e.vx += (dx / l) * 6;
        e.vy += (dy / l) * 6;
      }
      emit(game.events, 'enemyAttack', e.x, e.y, e.fx, e.fy, index, 1);
      e.ai = SCOUT_RECOVER;
      e.aiT = secToTicks(SCOUT.recover / aggr);
    }
    return;
  }

  if (e.ai === SCOUT_RECOVER) {
    if (--e.aiT <= 0) e.ai = SCOUT_CHASE;
  }

  if (!p || p.down) {
    steer.x = 0;
    steer.y = 0;
    return;
  }

  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const d = Math.sqrt(dx * dx + dy * dy);

  if (e.ai === SCOUT_CHASE && d <= SCOUT.attackRange) {
    e.ai = SCOUT_WINDUP;
    e.aiT = secToTicks(SCOUT.windup);
    e.fx = dx / d;
    e.fy = dy / d;
    emit(game.events, 'enemyWindup', e.x, e.y, e.fx, e.fy, index, 0, SCOUT.windup);
    steer.x = 0;
    steer.y = 0;
    return;
  }

  // Ближче за surroundRadius — цілимося в точку на колі навколо гравця під своїм кутом.
  let tx = p.x;
  let ty = p.y;
  if (d < SCOUT.surroundRadius && d > SCOUT.attackRange * 1.2) {
    const ring = Math.max(SCOUT.attackRange * 0.8, d * 0.5);
    tx = p.x + Math.cos(e.flank) * ring;
    ty = p.y + Math.sin(e.flank) * ring;
  }
  if (d < 8 && hasLineOfSight(game.world, e.x, e.y, p.x, p.y)) {
    steer.x = tx - e.x;
    steer.y = ty - e.y;
    const l = Math.sqrt(steer.x * steer.x + steer.y * steer.y) || 1;
    steer.x /= l;
    steer.y /= l;
  } else {
    steerTo(game, e, tx, ty);
  }
  // Під час відновлення повільніше: вікно, щоб відійти.
  const k = e.ai === SCOUT_RECOVER ? 0.4 : 1;
  steer.x *= k;
  steer.y *= k;
}
