import { SPIDER } from '../config/enemies';
import { hasLineOfSight } from '../collision/world';
import type { Enemy } from '../entities/enemy';
import { emit } from '../events';
import { DT, secToTicks } from '../math';
import type { Game } from '../state';
import { damagePlayer } from '../systems/damage';
import { flyTo, steer, steerTo } from '../systems/enemies';

export const SPIDER_CLIMB = 0;
export const SPIDER_PERCH = 1;
export const SPIDER_WINDUP = 2;
export const SPIDER_FLIGHT = 3;
export const SPIDER_LANDED = 4;

/**
 * Павук: бігає стінами й верхівками контейнерів (там недосяжний для автоприцілу),
 * вибирає опору біля гравця, присідає (точка приземлення на підлозі) і стрибає.
 * У польоті беззахисний (×2 шкоди, пріоритетна ціль); після — біжить землею до нової опори.
 */
export function updateSpider(game: Game, e: Enemy, index: number): void {
  const p = e.target >= 0 ? game.state.players[e.target] : undefined;
  const per = game.perches;

  switch (e.ai) {
    case SPIDER_CLIMB:
    case SPIDER_LANDED: {
      if (e.ai === SPIDER_LANDED) {
        steer.x = 0;
        steer.y = 0;
        if (--e.aiT > 0) return;
        e.ai = SPIDER_CLIMB;
        e.cover = -1;
      }
      if (!p || p.down) return;
      // Опора: найближча до цілі в межах стрибка, а серед рівних — ближча до самого павука.
      if (e.cover < 0 || (game.state.tick + index) % 30 === 0)
        e.cover = pickPerch(game, e, index, p.x, p.y);
      if (e.cover < 0) {
        // Жодної опори в межах стрибка (гравець далеко від стін і контейнерів):
        // злазить і полює з землі — підбігає й стрибає звідти. Інакше чекав би вічно.
        e.alt = Math.max(0, e.alt - 4 * DT);
        const pd = Math.hypot(p.x - e.x, p.y - e.y);
        if (
          ++e.aiT >= secToTicks(SPIDER.jumpEvery) &&
          pd < SPIDER.jumpRange - 1 &&
          e.alt < 0.1 &&
          hasLineOfSight(game.world, e.x, e.y, p.x, p.y)
        ) {
          e.ai = SPIDER_WINDUP;
          e.aiT = 0;
          e.tx = p.x;
          e.ty = p.y;
          emit(game.events, 'enemyWindup', e.x, e.y, p.x, p.y, index, 6, SPIDER.windup);
          return;
        }
        if (e.alt < 0.5) steerTo(game, e, p.x, p.y);
        else flyTo(e, p.x, p.y);
        return;
      }
      const tx = per.x[e.cover]!;
      const ty = per.y[e.cover]!;
      const d = Math.hypot(tx - e.x, ty - e.y);
      // На землі біжить у обхід перешкод; біля опори — дереться вгору.
      if (e.alt < 0.5 && d > 1.2) steerTo(game, e, tx, ty);
      else {
        flyTo(e, tx, ty);
        e.alt = Math.min(per.alt[e.cover]!, e.alt + 4 * DT);
      }
      if (d < 0.6 && e.alt >= per.alt[e.cover]! - 0.05) {
        e.ai = SPIDER_PERCH;
        e.aiT = 0;
        e.shots = 0;
        return;
      }
      // Запобіжник: дереться надто довго (штовханина, недосяжна опора) — злазить і полює з землі.
      if (++e.shots > secToTicks(6)) {
        e.shots = 0;
        e.cover = -1;
        e.alt = Math.min(e.alt, 0.4);
      }
      return;
    }
    case SPIDER_PERCH: {
      steer.x = 0;
      steer.y = 0;
      if (!p || p.down) return;
      e.fx = p.x - e.x;
      e.fy = p.y - e.y;
      const d = Math.hypot(e.fx, e.fy) || 1;
      e.fx /= d;
      e.fy /= d;
      e.aiT++;
      if (d > SPIDER.jumpRange + 1.5) {
        // Ціль пішла далеко — шукає ближчу опору.
        if (e.aiT > secToTicks(1)) e.ai = SPIDER_CLIMB;
        return;
      }
      // Видимість згори: заважає лише те, що вище за самого павука (опора під ним — ні).
      const canSee = hasLineOfSight(game.world, e.x, e.y, p.x, p.y, e.alt + 0.05);
      if (e.aiT >= secToTicks(SPIDER.jumpEvery / game.config.mods.aggression) && canSee) {
        e.ai = SPIDER_WINDUP;
        e.aiT = 0;
        e.tx = p.x;
        e.ty = p.y;
        emit(game.events, 'enemyWindup', e.x, e.y, p.x, p.y, index, 6, SPIDER.windup);
      } else if (e.aiT > secToTicks(SPIDER.jumpEvery + 6)) {
        // Запобіжник: довго не може стрибнути — шукає іншу опору, а не сидить вічно.
        e.ai = SPIDER_CLIMB;
        e.cover = -1;
      }
      return;
    }
    case SPIDER_WINDUP: {
      steer.x = 0;
      steer.y = 0;
      // Точка приземлення стежить за ціллю до самого стрибка.
      if (p && !p.down) {
        e.tx = p.x;
        e.ty = p.y;
      }
      if (++e.aiT >= secToTicks(SPIDER.windup)) {
        e.ai = SPIDER_FLIGHT;
        e.aiT = 0;
        e.ox = e.x;
        e.oy = e.y;
        emit(game.events, 'spiderJump', e.x, e.y, e.tx, e.ty, index);
      }
      return;
    }
    case SPIDER_FLIGHT: {
      // Балістика: позиція й висота задані часом, AI-кермо не потрібне.
      const total = secToTicks(SPIDER.flight);
      const t = Math.min(1, ++e.aiT / total);
      const nx = e.ox + (e.tx - e.ox) * t;
      const ny = e.oy + (e.ty - e.oy) * t;
      e.vx = (nx - e.x) / DT;
      e.vy = (ny - e.y) / DT;
      const startAlt = e.cover >= 0 ? game.perches.alt[e.cover]! : 0;
      e.alt = Math.max(0, startAlt * (1 - t) + Math.sin(t * Math.PI) * 1.2);
      steer.x = 0;
      steer.y = 0;
      e.exposed = true;
      if (t >= 1) {
        e.alt = 0;
        const r2 = SPIDER.landRadius * SPIDER.landRadius;
        for (const o of game.state.players)
          if (!o.down && (o.x - e.x) ** 2 + (o.y - e.y) ** 2 <= r2)
            damagePlayer(game, o, e.damage, e.x, e.y);
        emit(game.events, 'enemyAttack', e.x, e.y, e.fx, e.fy, index, 4);
        e.ai = SPIDER_LANDED;
        e.aiT = secToTicks(SPIDER.recover);
        e.exposed = false;
      }
      return;
    }
  }
}

function pickPerch(game: Game, e: Enemy, self: number, px: number, py: number): number {
  const per = game.perches;
  const en = game.state.enemies;
  let best = -1;
  let bestScore = Infinity;
  const reach = (SPIDER.jumpRange - 1) ** 2;
  for (let i = 0; i < per.count; i++) {
    const dp = (per.x[i]! - px) ** 2 + (per.y[i]! - py) ** 2;
    // Лише опори, звідки ціль у межах стрибка, і не ближче 3 м (стрибок, а не крок).
    if (dp < 9 || dp > reach) continue;
    // Опору іншого павука не займає: двоє штовхались би навколо неї вічно.
    let taken = false;
    for (let j = 0; j < en.length; j++)
      if (j !== self && en[j]!.alive && en[j]!.type === 'spider' && en[j]!.cover === i)
        taken = true;
    if (taken) continue;
    const de = Math.sqrt((per.x[i]! - e.x) ** 2 + (per.y[i]! - e.y) ** 2);
    const score = de;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}
