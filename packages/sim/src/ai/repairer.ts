import { REPAIRER, ROBOT_TYPES } from '../config/enemies';
import { hasLineOfSight } from '../collision/world';
import type { Enemy } from '../entities/enemy';
import { emit } from '../events';
import { TICKS_PER_SEC, secToTicks } from '../math';
import type { Game } from '../state';
import { steer, steerTo } from '../systems/enemies';

/**
 * Ремонтник: не атакує. Тримається за спинами роботів, на 10+ м від гравців, лікує
 * найпошкодженішого поруч і час від часу ставить щит на Панцира. Пріоритетна ціль,
 * до якої треба свідомо пробитися (DECISIONS.md, п. 33).
 */
export function updateRepairer(game: Game, e: Enemy, index: number): void {
  const s = game.state;
  const players = s.players;
  if (e.cd > 0) e.cd--;

  // Найближчий гравець — від нього тікаємо.
  let nearD = Infinity;
  let nx = 0;
  let ny = 0;
  for (const p of players) {
    if (p.down) continue;
    const d = (p.x - e.x) ** 2 + (p.y - e.y) ** 2;
    if (d < nearD) {
      nearD = d;
      nx = p.x;
      ny = p.y;
    }
  }

  // Підопічний: найпошкодженіший робот (або Панцир без щита) — перевибір раз на пів секунди.
  if (e.ally < 0 || !s.enemies[e.ally]?.alive || (s.tick + index) % 30 === 0)
    e.ally = pickAlly(game, e, index);
  const a = e.ally >= 0 ? s.enemies[e.ally]! : undefined;

  if (a) {
    // Позиція: за підопічним, з боку, протилежного гравцю.
    let bx = a.x - nx;
    let by = a.y - ny;
    const bl = Math.sqrt(bx * bx + by * by) || 1;
    bx = a.x + (bx / bl) * 3;
    by = a.y + (by / bl) * 3;
    steerTo(game, e, bx, by);
    const d2 = (a.x - e.x) ** 2 + (a.y - e.y) ** 2;
    if (
      d2 <= REPAIRER.healRange * REPAIRER.healRange &&
      hasLineOfSight(game.world, e.x, e.y, a.x, a.y)
    ) {
      if (a.hp < a.maxHp) a.hp = Math.min(a.maxHp, a.hp + REPAIRER.healPerSecond / TICKS_PER_SEC);
      if (a.type === 'shell' && a.shield <= 0 && e.cd === 0) {
        a.shield = REPAIRER.shield;
        e.cd = secToTicks(REPAIRER.shieldEvery);
        emit(game.events, 'shieldUp', a.x, a.y, 0, 0, e.ally);
      }
      const dx = a.x - e.x;
      const dy = a.y - e.y;
      const l = Math.sqrt(dx * dx + dy * dy) || 1;
      e.fx = dx / l;
      e.fy = dy / l;
    }
  } else {
    steer.x = 0;
    steer.y = 0;
  }

  // Гравець занадто близько — відступає, навіть кидаючи лікування. Без підопічних тікати
  // нема заради чого: останній Ремонтник на арені не водить гравця колами вічно.
  if (a && nearD < REPAIRER.keepAway * REPAIRER.keepAway) {
    const d = Math.sqrt(nearD) || 1;
    steerTo(game, e, e.x + ((e.x - nx) / d) * 4, e.y + ((e.y - ny) / d) * 4);
  }
}

function pickAlly(game: Game, e: Enemy, self: number): number {
  let best = -1;
  let bestScore = -Infinity;
  const en = game.state.enemies;
  for (let i = 0; i < en.length; i++) {
    const o = en[i]!;
    if (i === self || !o.alive || !ROBOT_TYPES.has(o.type)) continue;
    const missing = 1 - o.hp / o.maxHp;
    const needsShield = o.type === 'shell' && o.shield <= 0 ? 0.5 : 0;
    const dist = Math.sqrt((o.x - e.x) ** 2 + (o.y - e.y) ** 2);
    const score = missing + needsShield - dist * 0.02;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}
