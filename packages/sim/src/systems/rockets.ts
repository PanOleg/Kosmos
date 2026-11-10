import { emit } from '../events';
import type { Game } from '../state';
import { damagePlayer } from './damage';

/** Ракети Панцира: відлік до удару; ривок у момент удару рятує (невразливість). */
export function updateRockets(game: Game): void {
  for (const r of game.state.rockets) {
    if (!r.alive || --r.t > 0) continue;
    r.alive = false;
    const r2 = r.radius * r.radius;
    for (const p of game.state.players)
      if (!p.down && (p.x - r.x) ** 2 + (p.y - r.y) ** 2 <= r2)
        damagePlayer(game, p, r.damage, r.x, r.y);
    emit(game.events, 'rocketHit', r.x, r.y, 0, 0, 0, 0, r.radius);
  }
}
