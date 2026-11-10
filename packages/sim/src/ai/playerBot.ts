import { SCOUT_WINDUP } from './scout';
import { TEAM_ENEMY } from '../entities/projectile';
import type { PlayerInput } from '../protocol';
import type { Game } from '../state';

/**
 * Простий бот-гравець для розробки, тестів і підміни гравця, що відключився.
 * Читає стан, як побачила б людина: тримає дистанцію, ухиляється ривком від замахів і куль,
 * збирає деталі, коли поруч спокійно. Лише формує PlayerInput — правил не обходить.
 */
export function botInput(game: Game, slot: number, out: PlayerInput): void {
  const s = game.state;
  const p = s.players[slot];
  out.ability = false;
  out.dash = false;
  out.move.x = 0;
  out.move.y = 0;
  if (!p || p.down) return;

  let ax = 0;
  let ay = 0;
  let danger = false;
  for (const e of s.enemies) {
    if (!e.alive) continue;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > 36) continue;
    const d = Math.sqrt(d2) || 1;
    // Відштовхування від ближніх ворогів, сильніше впритул.
    const k = (6 - d) / 6;
    ax += (dx / d) * k * 2;
    ay += (dy / d) * k * 2;
    if (e.type === 'scout' && e.ai === SCOUT_WINDUP && d < 2.5) danger = true;
  }
  for (const b of s.projectiles) {
    if (!b.alive || b.team !== TEAM_ENEMY) continue;
    const dx = p.x - b.x;
    const dy = p.y - b.y;
    const d2 = dx * dx + dy * dy;
    // Куля летить на нас і близько.
    if (d2 < 9 && dx * b.vx + dy * b.vy > 0) {
      danger = true;
      const l = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 1;
      ax += -b.vy / l;
      ay += b.vx / l;
    }
  }

  // Найближча деталь: тягне, коли не тиснуть.
  let px = 0;
  let py = 0;
  let pd = 1e9;
  for (const k of s.pickups) {
    if (!k.alive) continue;
    const d = (k.x - p.x) ** 2 + (k.y - p.y) ** 2;
    if (d < pd) {
      pd = d;
      px = k.x;
      py = k.y;
    }
  }
  if (pd < 1e9) {
    const d = Math.sqrt(pd) || 1;
    ax += ((px - p.x) / d) * 0.8;
    ay += ((py - p.y) / d) * 0.8;
  }

  // Тяжіння до центру, щоб не забиватися в кут.
  ax += -p.x * 0.02;
  ay += -p.y * 0.02;

  // Повільне кружляння, щоб не стояти: детерміновано від тику.
  const t = s.tick * 0.01 + slot * 1.7;
  ax += Math.cos(t) * 0.3;
  ay += Math.sin(t) * 0.3;

  const l = Math.sqrt(ax * ax + ay * ay);
  if (l > 0.05) {
    out.move.x = ax / l;
    out.move.y = ay / l;
  }
  out.dash = danger && p.dashCd === 0;
}
