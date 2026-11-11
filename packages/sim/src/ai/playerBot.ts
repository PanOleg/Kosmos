import { CORE_CRANE, CORE_LASER, gridDistance } from './core';
import { CORE, FOREMAN, KAMIKAZE, SNIPER, SPIDER } from '../config/enemies';
import { FOREMAN_STRIKE } from './foreman';
import { SPIDER_FLIGHT, SPIDER_WINDUP } from './spider';
import { SNIPER_AIM } from './sniper';
import { BUY_LIFE, BUY_MEDKIT } from '../protocol';
import { UPGRADES } from '../config/upgrades';
import { slowAt, type SlowZone } from '../config/map';
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
 * Бот-напарник: розробка, тести й підміна гравця, що відключився (DECISIONS.md, п. 57).
 * Читає стан, як побачила б людина, і лише формує PlayerInput — правил не обходить:
 * тримає дистанцію своєї зброї, виходить із підсвічених зон (ракети, крани, стрибок Павука,
 * пікірування, лазер Снайпера) і ухиляється ривком, тримається команди, з малим здоров'ям
 * відступає до Медика, піднімає впалих, збирає деталі, коли спокійно, купує з розумом,
 * а здібність тисне за призначенням класу.
 */
/** Запас до краю зибучих пісків/заметів, який бот тримає, і як далеко дивиться вперед, м. */
const SLOW_MARGIN = 0.6;
const SLOW_LOOK = 4;
const steer = { x: 0, y: 0 };

/**
 * Обхід зон сповільнення: напрямок (ux, uy) одиничний, результат — у steer. Зовні, якщо шлях
 * перетинає зону ближче ніж SLOW_LOOK, — іде по дотичній з ближчого боку; на краю — не дає
 * зайти; усередині — веде назовні найкоротшим шляхом. Повертає true, якщо бот у самій зоні.
 */
function avoidSlow(zones: SlowZone[], px: number, py: number, ux: number, uy: number): boolean {
  let inside = false;
  for (const z of zones) {
    const wx = z.x - px;
    const wy = z.y - py;
    const d = Math.hypot(wx, wy) || 0.01;
    const R = z.r + SLOW_MARGIN;
    if (d < R) {
      // На краю або всередині: прибираємо рух до центру; усередині ще й штовхаємо назовні.
      const nx = wx / d;
      const ny = wy / d;
      const into = ux * nx + uy * ny;
      if (into > 0) {
        ux -= nx * into;
        uy -= ny * into;
      }
      if (d < z.r) {
        inside = true;
        ux -= nx * 1.5;
        uy -= ny * 1.5;
      } else if (Math.hypot(ux, uy) < 0.2) {
        // Ішли просто в центр: далі — уздовж краю.
        ux = -ny;
        uy = nx;
      }
    } else {
      const along = wx * ux + wy * uy;
      const cross = wx * uy - wy * ux;
      if (along <= 0 || Math.abs(cross) >= R) continue;
      if (along - Math.sqrt(R * R - cross * cross) > SLOW_LOOK) continue;
      // Дотична до кола з того боку, куди вже хилиться напрямок.
      const a = Math.asin(R / d) * (cross >= 0 ? 1 : -1);
      const c = Math.cos(a);
      const sn = Math.sin(a);
      ux = (wx * c - wy * sn) / d;
      uy = (wx * sn + wy * c) / d;
    }
    const l = Math.hypot(ux, uy) || 1;
    ux /= l;
    uy /= l;
  }
  steer.x = ux;
  steer.y = uy;
  return inside;
}

export function botInput(game: Game, slot: number, out: PlayerInput): void {
  const s = game.state;
  const map = game.config.map;
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
  const hurt = p.hp < p.maxHp * 0.4;
  // Бажана дистанція — дві третини дальності зброї: Інженер ближче, Медик далі.
  const keep = game.config.classes[p.classId].weapon.range * 0.65;
  let near = 0;
  let drones = 0;
  let kamiAiming = false;
  let dodgeX = 0;
  let dodgeY = 0;
  for (const e of s.enemies) {
    if (!e.alive) continue;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < 64) {
      near++;
      if (e.air) drones++;
    }
    // Підсвічені зони ударів: вийти за край, а з глибини — ривком.
    let zr = 0;
    if (e.type === 'foreman' && e.ai === FOREMAN_STRIKE) zr = FOREMAN.strikeRadius;
    else if (e.type === 'spider' && (e.ai === SPIDER_WINDUP || e.ai === SPIDER_FLIGHT))
      zr = SPIDER.landRadius;
    if (zr > 0) {
      const zx = p.x - e.tx;
      const zy = p.y - e.ty;
      const zd = Math.hypot(zx, zy) || 0.01;
      if (zd < zr + 1) {
        ax += (zx / zd) * 5;
        ay += (zy / zd) * 5;
        if (zd < zr) danger = true;
      }
    }
    // Лазер Снайпера цілить у нас — крок убік від променя; перед пострілом — ривок.
    if (e.type === 'sniper' && e.ai === SNIPER_AIM && (e.tx - p.x) ** 2 + (e.ty - p.y) ** 2 < 2.5) {
      const d = Math.sqrt(d2) || 1;
      const side = (s.tick >> 6) % 2 === slot % 2 ? 1 : -1;
      ax += (-dy / d) * side * 3;
      ay += (dx / d) * side * 3;
      if (e.aiT > (SNIPER.aim - 0.45) * 60) danger = true;
    }
    // Камікадзе. Під час замаху точка удару йде за гравцем — тікати з неї марно: крок убік і
    // бережемо ривок. Пікірування — пряма: якщо ми біля неї, ривок упоперек (dodge нижче).
    if (e.type === 'kamikaze' && e.ai === KAMI_WINDUP && e.target === slot) kamiAiming = true;
    if (e.type === 'kamikaze' && e.ai === KAMI_DIVE) {
      const along = -(dx * e.fx + dy * e.fy);
      const perp = dx * -e.fy + dy * e.fx;
      // along < 0 — ми попереду нього на лінії польоту.
      const ahead = -along;
      if (ahead > -1 && ahead < 16 && Math.abs(perp) < KAMIKAZE.blastRadius + 1.2) {
        const side = perp >= 0 ? 1 : -1;
        dodgeX += -e.fy * side;
        dodgeY += e.fx * side;
      }
    }
    if (d2 > 144) continue;
    const d = Math.sqrt(d2) || 1;
    // Відштовхування від ближніх ворогів, сильніше впритул. Ремонтник не б'є — від нього
    // не тікаємо (інакше вічна «рівновага» на межі дальності); від Панцира — лише впритул.
    const zone =
      e.type === 'repairer' ? 0 : e.type === 'shell' ? 3 : (hurt ? keep + 2 : keep) + e.radius;
    const k = d < zone ? (zone - d) / zone : 0;
    ax += (dx / d) * k * (hurt ? 3 : 2);
    ay += (dy / d) * k * (hurt ? 3 : 2);
    if (e.type === 'scout' && e.ai === SCOUT_WINDUP && d < 2.5) danger = true;
  }
  // Зони ракет (Панцир, Ядро): видно на підлозі заздалегідь — виходимо.
  for (const r of s.rockets) {
    if (!r.alive) continue;
    const zx = p.x - r.x;
    const zy = p.y - r.y;
    const zd = Math.hypot(zx, zy) || 0.01;
    if (zd < r.radius + 1) {
      ax += (zx / zd) * 5;
      ay += (zy / zd) * 5;
      if (zd < r.radius && r.t < 30) danger = true;
    }
  }
  // Бос: від відкритого шлюзу — геть (до центру), з променя сітки — убік, у проміжок.
  const boss = s.boss;
  // Удар краном і лазер Ядра третьої фази: та сама логіка зон.
  if (boss.phase === 3 && boss.attackState === 1 && boss.attack === CORE_CRANE) {
    const zx = p.x - boss.tx;
    const zy = p.y - boss.ty;
    const zd = Math.hypot(zx, zy) || 0.01;
    if (zd < CORE.craneRadius + 1) {
      ax += (zx / zd) * 5;
      ay += (zy / zd) * 5;
      if (zd < CORE.craneRadius) danger = true;
    }
  }
  if (boss.phase === 3 && boss.attackState === 1 && boss.attack === CORE_LASER) {
    if ((boss.tx - p.x) ** 2 + (boss.ty - p.y) ** 2 < 2.5) {
      const l = Math.hypot(p.x, p.y) || 1;
      ax += (-p.y / l) * 3;
      ay += (p.x / l) * 3;
    }
  }
  if (boss.airlockState > 0 && boss.airlock >= 0) {
    const al = game.config.map.airlocks[boss.airlock]!;
    const d = Math.hypot(al.x - p.x, al.y - p.y);
    if (d < 16) {
      const l = Math.hypot(p.x, p.y) || 1;
      ax += (-p.x / l) * 3;
      ay += (-p.y / l) * 3;
      if (d < 4) danger = true;
    }
  }
  if (boss.grid === 1 && gridDistance(boss, p.x, p.y) < CORE.gridHalfWidth + 0.6) {
    const nx = Math.cos(boss.gridAngle);
    const ny = Math.sin(boss.gridAngle);
    const side =
      gridDistance(boss, p.x + nx * 0.1, p.y + ny * 0.1) > gridDistance(boss, p.x, p.y) ? 1 : -1;
    ax += nx * side * 3;
    ay += ny * side * 3;
  }
  // Нікого в прицілі — підходимо до найближчого ворога (снайпер висить поза дальністю).
  if (p.target < 0) {
    let nd = Infinity;
    let nx = 0;
    let ny = 0;
    for (const e of s.enemies) {
      if (!e.alive) continue;
      // Велике тіло (Ядро на реакторі) — ідемо до його краю зі свого боку, а не в центр.
      const ed = Math.hypot(p.x - e.x, p.y - e.y) || 1;
      const off = e.radius > 1.5 ? e.radius + 1 : 0;
      const tx = e.x + ((p.x - e.x) / ed) * off;
      const ty = e.y + ((p.y - e.y) / ed) * off;
      const d2 = (tx - p.x) ** 2 + (ty - p.y) ** 2;
      if (d2 < nd) {
        nd = d2;
        nx = tx;
        ny = ty;
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
    // У бою по деталі в зибучі піски не ходимо; коли спокійно — можна.
    if (near > 0 && slowAt(map, k.x, k.y) < 1) continue;
    const d = (k.x - p.x) ** 2 + (k.y - p.y) ** 2;
    if (d < pd) {
      pd = d;
      px = k.x;
      py = k.y;
    }
  }
  // Деталі тягнуть, коли спокійно; у бою — ледь-ледь, поранений по них не ходить.
  if (pd < 1e9 && !hurt) {
    const d = Math.sqrt(pd) || 1;
    const w = near === 0 ? 1.2 : pd < 9 ? 0.6 : 0.2;
    ax += ((px - p.x) / d) * w;
    ay += ((py - p.y) / d) * w;
  }

  // Команда: не відбиватися далі ніж на 7 м від гурту; поранений тулиться до Медика.
  let cx = 0;
  let cy = 0;
  let cn = 0;
  let medic: (typeof s.players)[number] | null = null;
  for (const o of s.players) {
    if (o === p || o.down) continue;
    cx += o.x;
    cy += o.y;
    cn++;
    if (o.classId === 'medic') medic = o;
  }
  if (cn > 0) {
    const tx = hurt && medic ? medic.x : cx / cn;
    const ty = hurt && medic ? medic.y : cy / cn;
    const d = Math.hypot(tx - p.x, ty - p.y) || 1;
    const limit = hurt && medic ? 3 : 7;
    if (d > limit) {
      const w = Math.min(2, (d - limit) * 0.4) * (hurt ? 1.5 : 1);
      ax += ((tx - p.x) / d) * w;
      ay += ((ty - p.y) / d) * w;
    }
  }

  // Тяжіння до центру, щоб не забиватися в кут.
  ax += -p.x * 0.02;
  ay += -p.y * 0.02;

  // Легке кружляння, щоб не стояти мішенню: детерміновано від тику.
  const t = s.tick * 0.01 + slot * 1.7;
  ax += Math.cos(t) * 0.25;
  ay += Math.sin(t) * 0.25;

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

  // Камікадзе цілиться в нас: ходимо боком до нього, щоб пікірування пройшло повз.
  if (kamiAiming && dodgeX === 0 && dodgeY === 0) {
    const side = slot % 2 ? 1 : -1;
    for (const e of s.enemies)
      if (e.alive && e.type === 'kamikaze' && e.ai === KAMI_WINDUP && e.target === slot) {
        ax += -e.fy * side * 2.5;
        ay += e.fx * side * 2.5;
      }
  }
  // Пікірування по нас: усе інше почекає — ривок упоперек лінії.
  const dodging = dodgeX !== 0 || dodgeY !== 0;
  if (dodging) {
    ax = dodgeX * 10 + ax * 0.2;
    ay = dodgeY * 10 + ay * 0.2;
  }
  const l = Math.sqrt(ax * ax + ay * ay);
  if (l > 0.05) {
    out.move.x = ax / l;
    out.move.y = ay / l;
  }
  // Зибучі піски й замети обходимо по краю. Не тоді, коли рятуємося від удару (вийти із зони
  // ракети важливіше), ідемо піднімати впалого чи спокійно збираємо деталь, що лежить у пісках.
  let stuck = false;
  const calmLoot = near === 0 && pd < 1e9 && slowAt(map, px, py) < 1;
  if (map.slowZones && !dodging && !danger && rescue < 0 && !calmLoot) {
    stuck = avoidSlow(map.slowZones, p.x, p.y, out.move.x, out.move.y);
    out.move.x = steer.x;
    out.move.y = steer.y;
  }
  // Поки Камікадзе лише цілиться, ривок не витрачаємо на дрібниці. Загрузли під натиском —
  // ривок перетинає піски.
  out.dash = p.dashCd === 0 && (dodging || ((danger || (stuck && near >= 2)) && !kamiAiming));
  // Біля упалого тримає кнопку (підйом), решту логіки здібності пропускає.
  if (
    rescue >= 0 &&
    (s.players[rescue]!.x - p.x) ** 2 + (s.players[rescue]!.y - p.y) ** 2 <= REVIVE.range ** 2
  ) {
    out.ability = true;
    return;
  }

  // Між хвилями (чергуємо натискання, щоб був фронт): спершу аптечка, якщо поранений, і друге
  // життя одинака; далі — найдешевше покращення, за рівної ціни — зброя.
  if (shopOpen(game) && s.tick % 2 === 0) {
    const parts = wholeParts(p);
    if (p.hp < p.maxHp * 0.6 && !p.medkitBought && parts >= UPGRADES.medkit.price) {
      out.buy = BUY_MEDKIT;
      return;
    }
    if (s.players.length === 1 && !p.lifeBought && parts >= REVIVE.soloLifePrice) {
      out.buy = BUY_LIFE;
      return;
    }
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
    const bossWave = !!game.config.waves[s.wave.index]?.boss && s.wave.phase === 'active';
    switch (p.classId) {
      case 'medic':
        // Поле лікує всіх у радіусі 4 м, і себе теж.
        out.ability = s.players.some(
          (o) => !o.down && o.hp < o.maxHp * 0.65 && (o.x - p.x) ** 2 + (o.y - p.y) ** 2 < 16,
        );
        break;
      case 'tech':
        // ЕМІ валить дронів: двох досить; по наземних — коли тиснуть гуртом.
        out.ability = drones >= 2 || near >= 4;
        break;
      case 'engineer':
        // Бар'єр — від обстрілу й натовпу.
        out.ability = danger || near >= 3;
        break;
      default:
        // Перевантаження — коли є в кого стріляти: гурт або бос у прицілі.
        out.ability = p.target >= 0 && (near >= 3 || bossWave);
    }
  }
}
