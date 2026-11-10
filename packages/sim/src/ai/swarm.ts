import { SWARM } from '../config/enemies';
import type { Enemy } from '../entities/enemy';
import { emit } from '../events';
import { secToTicks } from '../math';
import type { Game } from '../state';
import { damagePlayer } from '../systems/damage';
import { flyTo } from '../systems/enemies';

/** Скільки роїв може існувати одночасно (номери груп за модулем). */
export const SWARM_GROUPS = 16;
const gx = new Float32Array(SWARM_GROUPS);
const gy = new Float32Array(SWARM_GROUPS);
const gn = new Int32Array(SWARM_GROUPS);

/** Центри роїв рахуються раз на тик для всіх. */
export function swarmCenters(game: Game): void {
  gx.fill(0);
  gy.fill(0);
  gn.fill(0);
  for (const e of game.state.enemies) {
    if (!e.alive || e.type !== 'swarm' || e.group < 0) continue;
    gx[e.group]! += e.x;
    gy[e.group]! += e.y;
    gn[e.group]!++;
  }
  for (let g = 0; g < SWARM_GROUPS; g++)
    if (gn[g]! > 0) {
      gx[g]! /= gn[g]!;
      gy[g]! /= gn[g]!;
    }
}

/**
 * Рій: десяток крихітних дронів хмарою. Кожен тягнеться до своєї точки навколо цілі
 * (кут flank) і тримається біля центру рою; поруч із гравцем кусає раз на секунду.
 */
export function updateSwarm(game: Game, e: Enemy, index: number): void {
  const p = e.target >= 0 ? game.state.players[e.target] : undefined;
  if (!p || p.down) return;
  const r = SWARM.cloud * 0.5;
  const t = game.state.tick * 0.05 + e.flank;
  let tx = p.x + Math.cos(t) * r;
  let ty = p.y + Math.sin(t) * r;
  // Згуртованість: точка зсувається до центру рою, щоб хмара не розсипалась.
  if (e.group >= 0 && gn[e.group]! > 1) {
    tx = tx * 0.7 + gx[e.group]! * 0.3;
    ty = ty * 0.7 + gy[e.group]! * 0.3;
  }
  flyTo(e, tx, ty);
  if (e.aiT > 0) e.aiT--;
  const d2 = (p.x - e.x) ** 2 + (p.y - e.y) ** 2;
  if (e.aiT === 0 && d2 < (SWARM.biteRange + game.config.player.radius) ** 2) {
    damagePlayer(game, p, e.damage, e.x, e.y);
    emit(game.events, 'enemyAttack', e.x, e.y, e.fx, e.fy, index, 2);
    e.aiT = secToTicks(SWARM.biteEvery);
  }
}
