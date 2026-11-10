import { AIR_COVER_HEIGHT, SNIPER } from '../config/enemies';
import { hasLineOfSight } from '../collision/world';
import type { Enemy } from '../entities/enemy';
import { TEAM_ENEMY } from '../entities/projectile';
import { emit } from '../events';
import { secToTicks } from '../math';
import type { Game } from '../state';
import { spawnProjectile } from '../systems/combat';
import { flyTo, steer } from '../systems/enemies';

export const SNIPER_HOLD = 0;
export const SNIPER_AIM = 1;

/** Скільки секунд до пострілу лазер перестає стежити за ціллю: останній шанс зійти з лінії. */
const LOCK_BEFORE = 0.35;

/**
 * Снайпер-дрон: висить за межами автоприцілу (15–17 м), 2 с цілиться — лазер видно
 * на підлозі, — потім б'є сильно й швидко. Рятує високе укриття або підійти ближче.
 */
export function updateSniper(game: Game, e: Enemy, index: number): void {
  const p = e.target >= 0 ? game.state.players[e.target] : undefined;
  if (!p || p.down) return;
  const dx = e.x - p.x;
  const dy = e.y - p.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  e.fx = -dx / d;
  e.fy = -dy / d;

  if (e.ai === SNIPER_HOLD) {
    // Дрейф по колу на бажаній дистанції; гравець ближче — відлітає.
    const want =
      SNIPER.holdMin +
      ((Math.sin(e.flank + game.state.tick * 0.01) + 1) / 2) * (SNIPER.holdMax - SNIPER.holdMin);
    const a = Math.atan2(dy, dx) + 0.15;
    flyTo(e, p.x + Math.cos(a) * want, p.y + Math.sin(a) * want);
    if (
      ++e.aiT >= secToTicks(SNIPER.cooldown / game.config.mods.aggression) &&
      hasLineOfSight(game.world, e.x, e.y, p.x, p.y, AIR_COVER_HEIGHT)
    ) {
      e.ai = SNIPER_AIM;
      e.aiT = 0;
      e.tx = p.x;
      e.ty = p.y;
      emit(game.events, 'enemyWindup', e.x, e.y, p.x, p.y, index, 5, SNIPER.aim);
    }
    return;
  }

  // Прицілювання: висить нерухомо, лазер стежить за ціллю до фіксації.
  steer.x = 0;
  steer.y = 0;
  e.exposed = true;
  const total = secToTicks(SNIPER.aim);
  if (e.aiT < total - secToTicks(LOCK_BEFORE)) {
    e.tx = p.x;
    e.ty = p.y;
  }
  if (++e.aiT >= total) {
    const tx = e.tx - e.x;
    const ty = e.ty - e.y;
    const l = Math.sqrt(tx * tx + ty * ty) || 1;
    spawnProjectile(
      game,
      TEAM_ENEMY,
      index,
      e.x,
      e.y,
      tx / l,
      ty / l,
      SNIPER.projectileSpeed,
      SNIPER.range,
      e.damage,
      0,
      0.2,
      true,
    );
    emit(game.events, 'enemyShot', e.x, e.y, tx / l, ty / l, index, 2);
    e.ai = SNIPER_HOLD;
    e.aiT = 0;
  }
}
