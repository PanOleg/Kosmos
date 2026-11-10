import { TURRET } from '../config/enemies';
import { hasLineOfSight } from '../collision/world';
import type { Enemy } from '../entities/enemy';
import { TEAM_ENEMY } from '../entities/projectile';
import { emit } from '../events';
import { DT, angleDiff, secToTicks } from '../math';
import type { Game } from '../state';
import { spawnProjectile } from '../systems/combat';
import { steer } from '../systems/enemies';

export const TURRET_TRACK = 0;
export const TURRET_WINDUP = 1;
export const TURRET_BURST = 2;

/**
 * Турель: стоїть, повільно повертається (90°/с) і б'є чергами туди, куди дивиться.
 * Обхід збоку виграє час, а ззаду — ×3 шкоди (DECISIONS.md, п. 37).
 */
export function updateTurret(game: Game, e: Enemy, index: number): void {
  steer.x = 0;
  steer.y = 0;
  e.vx = 0;
  e.vy = 0;
  const p = e.target >= 0 ? game.state.players[e.target] : undefined;
  if (!p || p.down) return;
  const want = Math.atan2(p.y - e.y, p.x - e.x);
  const cur = Math.atan2(e.fy, e.fx);
  if (e.ai !== TURRET_BURST) {
    const diff = angleDiff(cur, want);
    const max = TURRET.turnRate * DT;
    const a = cur + Math.max(-max, Math.min(max, diff));
    e.fx = Math.cos(a);
    e.fy = Math.sin(a);
  }
  const aligned = Math.abs(angleDiff(Math.atan2(e.fy, e.fx), want)) < 0.25;
  const d = Math.hypot(p.x - e.x, p.y - e.y);

  switch (e.ai) {
    case TURRET_TRACK:
      if (
        ++e.aiT >= secToTicks(TURRET.period / game.config.mods.aggression) &&
        aligned &&
        d < TURRET.range &&
        hasLineOfSight(game.world, e.x, e.y, p.x, p.y)
      ) {
        e.ai = TURRET_WINDUP;
        e.aiT = 0;
        emit(game.events, 'enemyWindup', e.x, e.y, p.x, p.y, index, 8, TURRET.windup);
      }
      return;
    case TURRET_WINDUP:
      e.exposed = true;
      if (++e.aiT >= secToTicks(TURRET.windup)) {
        e.ai = TURRET_BURST;
        e.aiT = 0;
        e.shots = 0;
      }
      return;
    case TURRET_BURST:
      e.exposed = true;
      if (e.aiT-- > 0) return;
      // Черга летить уздовж ствола — турель не «довертається» за ціллю всередині черги.
      spawnProjectile(
        game,
        TEAM_ENEMY,
        index,
        e.x + e.fx * 0.9,
        e.y + e.fy * 0.9,
        e.fx,
        e.fy,
        TURRET.projectileSpeed,
        TURRET.range,
        e.damage,
        0,
        0.2,
      );
      emit(game.events, 'enemyShot', e.x, e.y, e.fx, e.fy, index, 4);
      e.aiT = secToTicks(TURRET.burstGap);
      if (++e.shots >= TURRET.burst) {
        e.ai = TURRET_TRACK;
        e.aiT = 0;
      }
      return;
  }
}
