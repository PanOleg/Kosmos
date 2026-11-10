import { AIR_COVER_HEIGHT, WASP } from '../config/enemies';
import { hasLineOfSight } from '../collision/world';
import type { Enemy } from '../entities/enemy';
import { TEAM_ENEMY } from '../entities/projectile';
import { emit } from '../events';
import { secToTicks } from '../math';
import type { Game } from '../state';
import { spawnProjectile } from '../systems/combat';
import { flyTo } from '../systems/enemies';

export const WASP_ORBIT = 0;
export const WASP_WINDUP = 1;
export const WASP_BURST = 2;

/**
 * Оса: кружляє навколо цілі на 8 м і раз на 2 с дає коротку чергу згори.
 * Перед чергою на мить зависає й світиться — є час ухилитися. Відволікає, а не вбиває.
 */
export function updateWasp(game: Game, e: Enemy, index: number): void {
  const p = e.target >= 0 ? game.state.players[e.target] : undefined;
  if (!p || p.down) return;
  const aggr = game.config.mods.aggression;
  const dx = e.x - p.x;
  const dy = e.y - p.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;

  if (e.ai === WASP_ORBIT) {
    // Кружляння: точка на колі навколо цілі зсувається вперед за годинниковою стрілкою.
    const a = Math.atan2(dy, dx) + (e.flank > Math.PI ? 0.5 : -0.5);
    flyTo(e, p.x + Math.cos(a) * WASP.orbit, p.y + Math.sin(a) * WASP.orbit);
    if (++e.aiT >= secToTicks(WASP.period / aggr) && d < WASP.range) {
      e.ai = WASP_WINDUP;
      e.aiT = 0;
      emit(game.events, 'enemyWindup', e.x, e.y, p.x, p.y, index, 4, WASP.windup);
    }
    return;
  }
  e.fx = -dx / d;
  e.fy = -dy / d;
  e.exposed = true;
  if (e.ai === WASP_WINDUP) {
    if (++e.aiT >= secToTicks(WASP.windup)) {
      e.ai = WASP_BURST;
      e.aiT = 0;
      e.shots = 0;
    }
    return;
  }
  // Черга: постріли в поточну позицію цілі, без упередження — рух убік рятує.
  if (e.aiT-- <= 0) {
    if (hasLineOfSight(game.world, e.x, e.y, p.x, p.y, AIR_COVER_HEIGHT))
      spawnProjectile(
        game,
        TEAM_ENEMY,
        index,
        e.x,
        e.y,
        -dx / d,
        -dy / d,
        WASP.projectileSpeed,
        WASP.range,
        e.damage,
        0,
        0.18,
        true,
      );
    emit(game.events, 'enemyShot', e.x, e.y, -dx / d, -dy / d, index, 1);
    e.aiT = secToTicks(WASP.burstGap);
    if (++e.shots >= WASP.burst) {
      e.ai = WASP_ORBIT;
      e.aiT = 0;
    }
  }
}
