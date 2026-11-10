import { SCOUT } from '../config/enemies';
import { ENEMIES } from '../config/enemies';
import { hasLineOfSight } from '../collision/world';
import { SCOUT_WINDUP } from '../ai/scout';
import type { Enemy } from '../entities/enemy';
import type { Player } from '../entities/player';
import type { Game } from '../state';

/**
 * Загроза ворога для автоприцілу: базова вага типу + ситуативні бонуси
 * (замах Скаута, визирання Стрільця). Пробивність враховуватиметься тут же для Камікадзе.
 */
export function threatOf(e: Enemy): number {
  let t = ENEMIES[e.type].threat;
  if (e.type === 'scout' && e.ai === SCOUT_WINDUP) t += SCOUT.windupThreat;
  if (e.exposed) t += 10;
  return t;
}

function valid(game: Game, p: Player, idx: number, range: number): boolean {
  const e = game.state.enemies[idx];
  if (!e || !e.alive) return false;
  const dx = e.x - p.x;
  const dy = e.y - p.y;
  const r = range + e.radius;
  if (dx * dx + dy * dy > r * r) return false;
  return hasLineOfSight(game.world, p.x, p.y, e.x, e.y);
}

export function updateAutoaim(game: Game): void {
  const s = game.state;
  const cfg = game.config.autoaim;
  const h = game.hash;
  for (const p of s.players) {
    if (p.down) continue;
    const range = Math.min(
      game.config.player.autoaimRadius,
      game.config.classes[p.classId].weapon.range,
    );
    const current = p.target;
    const currentValid = current >= 0 && valid(game, p, current, range);
    if (!currentValid) p.target = -1;
    if (currentValid && (s.tick + p.slot) % cfg.retargetEvery !== 0) continue;

    let best = -1;
    let bestScore = -Infinity;
    const x0 = Math.max(0, Math.floor((p.x - range + h.half) / h.cell));
    const x1 = Math.min(h.n - 1, Math.floor((p.x + range + h.half) / h.cell));
    const y0 = Math.max(0, Math.floor((p.y - range + h.half) / h.cell));
    const y1 = Math.min(h.n - 1, Math.floor((p.y + range + h.half) / h.cell));
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        for (let j = h.head[gy * h.n + gx]!; j >= 0; j = h.next[j]!) {
          const e = s.enemies[j]!;
          if (!e.alive) continue;
          const dx = e.x - p.x;
          const dy = e.y - p.y;
          const d2 = dx * dx + dy * dy;
          const r = range + e.radius;
          if (d2 > r * r) continue;
          const d = Math.sqrt(d2);
          let score = threatOf(e) + (1 - d / r) * cfg.proximity;
          if (j === current) score += cfg.stickiness;
          // LOS дорожчий за все інше — перевіряємо лише кандидатів, що можуть перемогти.
          if (score <= bestScore) continue;
          if (!hasLineOfSight(game.world, p.x, p.y, e.x, e.y)) continue;
          bestScore = score;
          best = j;
        }
      }
    }
    p.target = best;
  }
}
