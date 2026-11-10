import { SCOUT_WINDUP } from './scout';
import { KAMI_DIVE, KAMI_WINDUP } from './kamikaze';
import { TEAM_ENEMY } from '../entities/projectile';
import type { PlayerInput } from '../protocol';
import type { Game } from '../state';
import { shopOpen, upgradePrice, wholeParts } from '../systems/upgrades';
import { UPGRADE_ORDER } from '../config/upgrades';

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
  out.buy = 0;
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
    // Камікадзе: пікірування поруч — ривок убік від лінії удару.
    if (e.type === 'kamikaze' && (e.ai === KAMI_DIVE || e.ai === KAMI_WINDUP) && d < 4) {
      danger = e.ai === KAMI_DIVE;
      ax += -e.fy * 2;
      ay += e.fx * 2;
    }
  }
  // Нікого в прицілі — підходимо до найближчого ворога (снайпер висить поза дальністю).
  if (p.target < 0) {
    let nd = Infinity;
    let nx = 0;
    let ny = 0;
    for (const e of s.enemies) {
      if (!e.alive) continue;
      const d2 = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
      if (d2 < nd) {
        nd = d2;
        nx = e.x;
        ny = e.y;
      }
    }
    if (nd < Infinity && nd > 100) {
      const d = Math.sqrt(nd);
      ax += ((nx - p.x) / d) * 1.2;
      ay += ((ny - p.y) / d) * 1.2;
    }
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

  // Між хвилями — найдешевше доступне покращення (чергуємо натискання, щоб був фронт).
  if (shopOpen(game) && s.tick % 2 === 0) {
    let best = 0;
    let bestPrice = Infinity;
    UPGRADE_ORDER.forEach((id, i) => {
      const price = upgradePrice(p, id);
      if (price !== null && price <= wholeParts(p) && price < bestPrice) {
        bestPrice = price;
        best = i + 1;
      }
    });
    out.buy = best;
  }

  // Здібність: коли поруч тиснуть вороги (або, для Медика, хтось поранений).
  // Ввід — стан кнопки, тож чергуємо true/false, щоб був передній фронт.
  if (p.abilityCd === 0 && p.abilityT === 0 && p.overheatT === 0 && s.tick % 2 === 0) {
    let near = 0;
    for (const e of s.enemies) if (e.alive && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < 64) near++;
    const hurt = s.players.some(
      (o) => !o.down && o.hp < o.maxHp * 0.6 && (o.x - p.x) ** 2 + (o.y - p.y) ** 2 < 16,
    );
    out.ability = p.classId === 'medic' ? hurt : near >= 3 || (p.classId === 'engineer' && danger);
  }
}
