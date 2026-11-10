import { SCOUT_WINDUP } from './scout';
import { KAMI_DIVE, KAMI_WINDUP } from './kamikaze';
import { TEAM_ENEMY } from '../entities/projectile';
import type { PlayerInput } from '../protocol';
import type { Game } from '../state';
import { raycast } from '../collision/world';
import {
  navDir,
  navSharingBlocked,
  navToPoint,
  sampleNav,
  type NavField,
} from '../systems/navigation';

/** Навігація ботів до вибраного ворога: окреме поле на гру й слот, перерахунок раз на 30 тиків. */
const botNavs = new WeakMap<Game, NavField[]>();
function botNav(game: Game, slot: number): NavField {
  let list = botNavs.get(game);
  if (!list) {
    list = [];
    botNavs.set(game, list);
  }
  return (list[slot] ??= navSharingBlocked(game.nav));
}
import { shopOpen, upgradePrice, wholeParts } from '../systems/upgrades';
import { reviveCost } from '../systems/revive';
import { REVIVE } from '../config/revive';
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
    // Відштовхування від ближніх ворогів, сильніше впритул. Ремонтник не б'є — від нього
    // не тікаємо (інакше вічна «рівновага» на межі дальності); від Панцира — лише впритул.
    const zone = e.type === 'repairer' ? 0 : e.type === 'shell' ? 3 : 6;
    const k = d < zone ? (zone - d) / zone : 0;
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
    // Підходить, доки ворог не опиниться в межах дальності власної зброї (у Інженера — 6 м).
    // Ціль не взята (далеко або за укриттям) — підходимо, поки її не візьме автоприціл.
    if (nd < Infinity && nd > 2.5 * 2.5) {
      const d = Math.sqrt(nd);
      let ux = (nx - p.x) / d;
      let uy = (ny - p.y) / d;
      // Пряма закрита (контейнери, скло, бортик) — іде полем навігації до цього ворога.
      if (raycast(game.world, p.x, p.y, nx, ny, false) < 1) {
        const nav = botNav(game, slot);
        if ((s.tick + slot) % 30 === 0 || nav.dist[0] === 0) navToPoint(nav, nx, ny);
        if (sampleNav(nav, p.x, p.y)) {
          ux = navDir.x;
          uy = navDir.y;
        }
      }
      ax += ux * 1.2;
      ay += uy * 1.2;
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

  // Упалий напарник і деталей вистачає — іде піднімати: тягне сильніше за все, крім небезпеки.
  let rescue = -1;
  if (wholeParts(p) >= reviveCost(game, p)) {
    let rd = Infinity;
    for (const o of s.players) {
      if (o === p || !o.down || o.out) continue;
      const d = (o.x - p.x) ** 2 + (o.y - p.y) ** 2;
      if (d < rd) {
        rd = d;
        rescue = o.slot;
      }
    }
    if (rescue >= 0) {
      const o = s.players[rescue]!;
      const d = Math.sqrt(rd) || 1;
      if (d > REVIVE.range * 0.6) {
        ax = ((o.x - p.x) / d) * 3 + ax * 0.3;
        ay = ((o.y - p.y) / d) * 3 + ay * 0.3;
      } else {
        ax *= 0.1;
        ay *= 0.1;
      }
    }
  }

  const l = Math.sqrt(ax * ax + ay * ay);
  if (l > 0.05) {
    out.move.x = ax / l;
    out.move.y = ay / l;
  }
  out.dash = danger && p.dashCd === 0;
  // Біля упалого тримає кнопку (підйом), решту логіки здібності пропускає.
  if (
    rescue >= 0 &&
    (s.players[rescue]!.x - p.x) ** 2 + (s.players[rescue]!.y - p.y) ** 2 <= REVIVE.range ** 2
  ) {
    out.ability = true;
    return;
  }

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
