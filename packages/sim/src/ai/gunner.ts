import type { Enemy } from '../entities/enemy';
import type { Game } from '../state';
import { steerTo, steer } from '../systems/enemies';

/** Заглушка до коміту 6: Стрілець поки просто підходить. */
export function updateGunner(game: Game, e: Enemy, _index: number): void {
  const p = e.target >= 0 ? game.state.players[e.target] : undefined;
  if (!p) return;
  const d = Math.hypot(p.x - e.x, p.y - e.y);
  if (d > 8) steerTo(game, e, p.x, p.y);
  else {
    steer.x = 0;
    steer.y = 0;
  }
}
