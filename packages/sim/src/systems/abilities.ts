import { ABILITIES } from '../config/classes';
import { resolveCircle } from '../collision/world';
import type { Barrier } from '../entities/barrier';
import type { Player } from '../entities/player';
import { emit } from '../events';
import { TICKS_PER_SEC, secToTicks } from '../math';
import type { Game } from '../state';
import { SCOUT_CHASE, SCOUT_WINDUP } from '../ai/scout';

/** Індекс класу в подіях: рендер вибирає ефект за ним. */
export const ABILITY_CLASS_INDEX = { assault: 0, engineer: 1, medic: 2, tech: 3 } as const;

/** 0..1: частка готовності здібності; 1 — можна тиснути. Для кільця на пульті й у HUD. */
export function abilityReadiness(game: Game, p: Player): number {
  if (p.abilityT > 0 || p.overheatT > 0) return 0;
  const total = secToTicks(game.config.classes[p.classId].abilityCooldown);
  return total > 0 ? 1 - p.abilityCd / total : 1;
}

export function updateAbilities(game: Game): void {
  const s = game.state;
  for (const p of s.players) {
    if (p.abilityCd > 0) p.abilityCd--;
    if (p.overheatT > 0) p.overheatT--;
    if (p.abilityT > 0) {
      p.abilityT--;
      tickActive(game, p);
      if (p.abilityT === 0) endAbility(game, p);
    }
    if (p.down || !p.abilityPressed || p.abilityCd > 0 || p.abilityT > 0 || p.overheatT > 0)
      continue;
    // Перезарядка рахується від натискання; для тривалих здібностей — включно з дією,
    // як у BALANCE (15 с у Штурмовика охоплюють 5 с перевантаження й 2 с перегріву).
    p.abilityCd = secToTicks(game.config.classes[p.classId].abilityCooldown);
    activate(game, p);
  }
  updateBarriers(game);
}

function activate(game: Game, p: Player): void {
  const s = game.state;
  emit(game.events, 'ability', p.x, p.y, p.fx, p.fy, p.slot, ABILITY_CLASS_INDEX[p.classId]);
  switch (p.classId) {
    case 'assault':
      p.abilityT = secToTicks(ABILITIES.overload.duration);
      break;
    case 'medic':
      p.abilityT = secToTicks(ABILITIES.healField.duration);
      break;
    case 'engineer': {
      const b = s.barriers.find((x) => !x.alive) ?? oldestBarrier(s.barriers);
      const cfg = ABILITIES.barrier;
      // Стіна перед Інженером, поперек погляду: прикриває його й тих, хто позаду.
      let cx = p.x + p.fx * cfg.distance;
      let cy = p.y + p.fy * cfg.distance;
      const r = resolveCircle(game.world, cx, cy, 0.3);
      cx = r.x;
      cy = r.y;
      b.alive = true;
      b.owner = p.slot;
      b.x = cx;
      b.y = cy;
      b.ux = -p.fy;
      b.uy = p.fx;
      b.halfLen = cfg.length / 2;
      b.halfThick = cfg.thickness / 2;
      b.hp = b.maxHp = cfg.hp;
      b.life = secToTicks(cfg.duration);
      break;
    }
    case 'tech': {
      const cfg = ABILITIES.emp;
      const r2 = cfg.radius * cfg.radius;
      const stun = secToTicks(cfg.stun);
      for (const e of s.enemies) {
        if (!e.alive) continue;
        if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 > r2) continue;
        e.stun = Math.max(e.stun, stun);
        // Замах переривається: заглушений Скаут починає атаку спочатку.
        if (e.type === 'scout' && e.ai === SCOUT_WINDUP) e.ai = SCOUT_CHASE;
      }
      break;
    }
  }
}

function tickActive(game: Game, p: Player): void {
  if (p.classId !== 'medic' || p.down) return;
  const cfg = ABILITIES.healField;
  const r2 = cfg.radius * cfg.radius;
  const amount = cfg.perSecond / TICKS_PER_SEC;
  // Поле рухається разом із Медиком і лікує всіх живих поруч, включно з ним самим.
  for (const o of game.state.players) {
    if (o.down || o.hp >= o.maxHp) continue;
    if ((o.x - p.x) ** 2 + (o.y - p.y) ** 2 > r2) continue;
    o.hp = Math.min(o.maxHp, o.hp + amount);
  }
}

function endAbility(game: Game, p: Player): void {
  if (p.classId === 'assault') p.overheatT = secToTicks(ABILITIES.overload.overheat);
  emit(game.events, 'abilityEnd', p.x, p.y, 0, 0, p.slot, ABILITY_CLASS_INDEX[p.classId]);
}

function oldestBarrier(list: Barrier[]): Barrier {
  let best = list[0]!;
  for (const b of list) if (b.life < best.life) best = b;
  return best;
}

function updateBarriers(game: Game): void {
  for (const b of game.state.barriers) {
    if (!b.alive) continue;
    if (--b.life <= 0) {
      b.alive = false;
      emit(game.events, 'barrierBreak', b.x, b.y, b.ux, b.uy, b.owner);
    }
  }
}

/** Пошкодити бар'єр; на нулі він руйнується. */
export function damageBarrier(game: Game, b: Barrier, amount: number, x: number, y: number): void {
  b.hp -= amount;
  emit(game.events, 'barrierHit', x, y, b.ux, b.uy, b.owner, 0, amount);
  if (b.hp <= 0) {
    b.alive = false;
    emit(game.events, 'barrierBreak', b.x, b.y, b.ux, b.uy, b.owner);
  }
}

/**
 * Перетин відрізка a→b з бар'єром (OBB у його локальних координатах).
 * Повертає частку t ∈ [0,1] до входу, або 2, якщо мимо.
 */
export function segBarrier(b: Barrier, ax: number, ay: number, bx: number, by: number): number {
  const rx = ax - b.x;
  const ry = ay - b.y;
  const dx = bx - ax;
  const dy = by - ay;
  // Локальні осі: u — уздовж стіни, v — поперек.
  const lax = rx * b.ux + ry * b.uy;
  const lay = -rx * b.uy + ry * b.ux;
  const ldx = dx * b.ux + dy * b.uy;
  const ldy = -dx * b.uy + dy * b.ux;
  const along = slab(lax, ldx, b.halfLen, 0, 1);
  if (along < 0) return 2;
  const tminA = slabMin;
  const across = slab(lay, ldy, b.halfThick, tminA, along);
  if (across < 0) return 2;
  return slabMin;
}

// Результат slab(): вхід у смугу; повертає вихід або −1, якщо перетину немає. Без алокацій.
let slabMin = 0;
function slab(o: number, d: number, h: number, tmin: number, tmax: number): number {
  if (Math.abs(d) < 1e-9) {
    slabMin = tmin;
    return o < -h || o > h ? -1 : tmax;
  }
  let t1 = (-h - o) / d;
  let t2 = (h - o) / d;
  if (t1 > t2) {
    const tmp = t1;
    t1 = t2;
    t2 = tmp;
  }
  const lo = Math.max(tmin, t1);
  const hi = Math.min(tmax, t2);
  slabMin = lo;
  return lo > hi ? -1 : hi;
}
