import { AIR_COVER_HEIGHT, ENEMIES, KAMIKAZE, SCOUT, SNIPER, SPIDER } from '../config/enemies';
import { isHigh, outOfReach } from '../entities/enemy';
import { SPIDER_FLIGHT } from '../ai/spider';
import { SNIPER_AIM } from '../ai/sniper';
import { hasLineOfSight } from '../collision/world';
import { SCOUT_WINDUP } from '../ai/scout';
import type { Enemy } from '../entities/enemy';
import type { Player } from '../entities/player';
import type { Game } from '../state';
import { stormPhase } from './waves';

/**
 * Загроза ворога для автоприцілу: базова вага типу + ситуативні бонуси
 * (замах Скаута, визирання Стрільця). Пробивність враховуватиметься тут же для Камікадзе.
 */
export function threatOf(e: Enemy): number {
  let t = ENEMIES[e.type].threat;
  if (e.type === 'scout' && e.ai === SCOUT_WINDUP) t += SCOUT.windupThreat;
  if (e.type === 'sniper' && e.ai === SNIPER_AIM) t += SNIPER.aimThreat;
  if (e.type === 'spider' && e.ai === SPIDER_FLIGHT) t += SPIDER.flightThreat;
  if (e.exposed) t += 10;
  return t;
}

/**
 * Камікадзе в лоб невразливий (DECISIONS.md, п. 29): автоприціл не марнує на нього постріли,
 * поки гравець перед його носом. Збоку, ззаду чи на землі після ЕМІ — найвища загроза.
 */
function kamikazeHittable(e: Enemy, px: number, py: number): boolean {
  if (e.stun > 0) return true;
  const dx = px - e.x;
  const dy = py - e.y;
  const l = Math.sqrt(dx * dx + dy * dy) || 1;
  return (dx / l) * e.fx + (dy / l) * e.fy < KAMIKAZE.frontCos;
}

/** Пряма видимість з урахуванням висоти: до дрона в повітрі низькі перешкоди не заважають. */
function canSee(game: Game, px: number, py: number, e: Enemy): boolean {
  // Ядро стоїть на реакторі, що сам блокує постріли: цілимося в край тіла з боку гравця.
  if (e.type === 'core') {
    const d = Math.hypot(px - e.x, py - e.y) || 1;
    const k = (e.radius + 0.1) / d;
    return hasLineOfSight(game.world, px, py, e.x + (px - e.x) * k, e.y + (py - e.y) * k);
  }
  return hasLineOfSight(game.world, px, py, e.x, e.y, isHigh(e) ? AIR_COVER_HEIGHT : 0);
}

function valid(game: Game, p: Player, idx: number, range: number): boolean {
  const e = game.state.enemies[idx];
  if (!e || !e.alive) return false;
  const dx = e.x - p.x;
  const dy = e.y - p.y;
  const r = range + e.radius;
  if (dx * dx + dy * dy > r * r) return false;
  if (e.type === 'kamikaze' && !kamikazeHittable(e, p.x, p.y)) return false;
  if (outOfReach(e)) return false;
  return canSee(game, p.x, p.y, e);
}

export function updateAutoaim(game: Game): void {
  const s = game.state;
  const cfg = game.config.autoaim;
  const h = game.hash;
  const storm = stormPhase(game) === 2;
  for (const p of s.players) {
    if (p.down) continue;
    // Буря: видно гірше — приціл бере ближче.
    const range =
      Math.min(game.config.player.autoaimRadius, game.config.classes[p.classId].weapon.range) *
      (storm ? (game.config.map.storm?.aimMul ?? 1) : 1);
    const current = p.target;
    const currentValid = current >= 0 && valid(game, p, current, range);
    if (!currentValid) p.target = -1;
    if (currentValid && (s.tick + p.slot) % cfg.retargetEvery !== 0) continue;

    let best = -1;
    let bestScore = -Infinity;
    // Запас на радіус найбільшого тіла (Ядро): його центр може бути поза дальністю.
    const q = range + 3;
    const x0 = Math.max(0, Math.floor((p.x - q + h.half) / h.cell));
    const x1 = Math.min(h.n - 1, Math.floor((p.x + q + h.half) / h.cell));
    const y0 = Math.max(0, Math.floor((p.y - q + h.half) / h.cell));
    const y1 = Math.min(h.n - 1, Math.floor((p.y + q + h.half) / h.cell));
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
          if (e.type === 'kamikaze' && !kamikazeHittable(e, p.x, p.y)) continue;
          if (outOfReach(e)) continue;
          const d = Math.sqrt(d2);
          let score = threatOf(e) + (1 - d / r) * cfg.proximity;
          if (j === current) score += cfg.stickiness;
          // LOS дорожчий за все інше — перевіряємо лише кандидатів, що можуть перемогти.
          if (score <= bestScore) continue;
          if (!canSee(game, p.x, p.y, e)) continue;
          bestScore = score;
          best = j;
        }
      }
    }
    p.target = best;
  }
}
