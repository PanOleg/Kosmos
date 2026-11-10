import { REVIVE } from '../config/revive';
import type { Player } from '../entities/player';
import { emit } from '../events';
import { TICKS_PER_SEC, secToTicks } from '../math';
import type { Game } from '../state';
import { wholeParts } from './upgrades';

/** Ціна підйому для цього рятівника зараз: 30% його деталей, не менше мінімуму хвилі; Медику — половина. */
export function reviveCost(game: Game, rescuer: Player): number {
  const min = REVIVE.minBase + REVIVE.minPerWave * (game.state.wave.index + 1);
  const cost = Math.max(min, Math.floor(wholeParts(rescuer) * REVIVE.share));
  return Math.ceil(cost * (rescuer.classId === 'medic' ? REVIVE.medicMul : 1));
}

/** Найближчий упалий (ще не вибулий) напарник у межах дії, −1 — немає. */
export function downedAllyNear(game: Game, p: Player): number {
  let best = -1;
  let bestD = REVIVE.range * REVIVE.range;
  for (const o of game.state.players) {
    if (o === p || !o.down || o.out) continue;
    const d = (o.x - p.x) ** 2 + (o.y - p.y) ** 2;
    if (d <= bestD) {
      bestD = d;
      best = o.slot;
    }
  }
  return best;
}

/** Гравець падає: вмикається відлік до вибування, його власний підйом напарника переривається. */
export function onPlayerDown(p: Player): void {
  p.bleedT = secToTicks(REVIVE.bleedOut);
  p.reviving = -1;
  p.reviveT = 0;
}

function standUp(game: Game, p: Player, x = p.x, y = p.y): void {
  p.down = false;
  p.out = false;
  p.hp = Math.max(1, Math.round(p.maxHp * REVIVE.hpFrac));
  p.x = p.px = x;
  p.y = p.py = y;
  p.invuln = secToTicks(REVIVE.invuln);
  p.bleedT = 0;
}

/**
 * Має йти до здібностей: поруч з упалим кнопка здібності означає «підняти»,
 * тож здібність тут не спрацьовує (інакше підйом коштував би й здібності).
 */
export function updateRevive(game: Game): void {
  const s = game.state;
  const solo = s.players.length === 1;
  const hold = secToTicks(REVIVE.hold);

  for (const p of s.players) {
    if (p.down) {
      if (p.out) continue;
      p.bleedT--;
      // Соло-запобіжник: автоматичний підйом через 2 с (DECISIONS.md, п. 12, 35).
      if (
        solo &&
        p.autoRevives > 0 &&
        secToTicks(REVIVE.bleedOut) - p.bleedT >= secToTicks(REVIVE.soloAutoDelay)
      ) {
        p.autoRevives--;
        standUp(game, p);
        emit(game.events, 'revived', p.x, p.y, 0, 0, p.slot, -1, 0);
        continue;
      }
      if (p.bleedT <= 0) {
        p.out = true;
        emit(game.events, 'bleedOut', p.x, p.y, 0, 0, p.slot);
      }
      continue;
    }

    // Медик у соло підлікується між хвилями.
    if (solo && p.classId === 'medic' && s.wave.phase === 'pause' && p.hp < p.maxHp)
      p.hp = Math.min(p.maxHp, p.hp + REVIVE.medicSoloRegen / TICKS_PER_SEC);

    const ally = downedAllyNear(game, p);
    if (ally >= 0) p.abilityPressed = false;
    const holding = p.prevAbility;
    const can = ally >= 0 && holding && wholeParts(p) >= reviveCost(game, p);
    if (!can) {
      if (p.reviving >= 0) emit(game.events, 'reviveCancel', p.x, p.y, 0, 0, p.slot, p.reviving);
      p.reviving = -1;
      p.reviveT = 0;
      continue;
    }
    if (p.reviving !== ally) {
      p.reviving = ally;
      p.reviveT = 0;
      emit(game.events, 'reviveStart', p.x, p.y, 0, 0, p.slot, ally);
    }
    if (++p.reviveT >= hold) {
      const cost = reviveCost(game, p);
      const o = s.players[ally]!;
      p.parts -= cost;
      p.stats.partsSpent += cost;
      p.stats.revives++;
      standUp(game, o);
      emit(game.events, 'revived', o.x, o.y, 0, 0, ally, p.slot, cost);
      p.reviving = -1;
      p.reviveT = 0;
    }
  }
}

/** Початок паузи перед хвилею: вибулі повертаються з половиною здоров'я й без деталей. */
export function returnOutPlayers(game: Game): void {
  const spawns = game.config.map.playerSpawns;
  for (const p of game.state.players) {
    if (!p.out) continue;
    const sp = spawns[p.slot % spawns.length]!;
    standUp(game, p, sp.x, sp.y);
    p.parts = 0;
    emit(game.events, 'playerReturn', p.x, p.y, 0, 0, p.slot);
  }
}

/** Програш: усі впали, і в соло не лишилось автопідйому. */
export function allLost(game: Game): boolean {
  const ps = game.state.players;
  if (!ps.every((p) => p.down)) return false;
  return !(ps.length === 1 && ps[0]!.autoRevives > 0 && !ps[0]!.out);
}
