import {
  BUY_LIFE,
  BUY_MEDKIT,
  MAX_UPGRADE_LEVEL,
  UPGRADES,
  UPGRADE_ORDER,
  type UpgradeId,
} from '../config/upgrades';
import type { Player } from '../entities/player';
import { REVIVE } from '../config/revive';
import { emit } from '../events';
import { secToTicks } from '../math';
import type { Game } from '../state';

/** Магазин відкритий у паузі перед хвилею (DECISIONS.md, п. 26). */
export function shopOpen(game: Game): boolean {
  return game.state.phase === 'playing' && game.state.wave.phase === 'pause';
}

/** Ціна наступного рівня; null — уже максимум. */
export function upgradePrice(p: Player, id: UpgradeId): number | null {
  const lvl = p.upg[id];
  return lvl >= MAX_UPGRADE_LEVEL ? null : UPGRADES[id].prices[lvl]!;
}

/** Цілі деталі гравця: частки від спільного поділу накопичуються, але купують цілими. */
export function wholeParts(p: Player): number {
  return Math.floor(p.parts + 1e-6);
}

export function weaponDamageMul(p: Player): number {
  return 1 + UPGRADES.weapon.damagePerLevel * p.upg.weapon;
}

/** Перезарядка здібності з урахуванням покращення, тики. */
export function abilityCooldownTicks(game: Game, p: Player): number {
  const base = game.config.classes[p.classId].abilityCooldown;
  return secToTicks(base * (1 - UPGRADES.ability.cooldownPerLevel * p.upg.ability));
}

/** Третій рівень здібності посилює ефект. */
export function abilityBoosted(p: Player): boolean {
  return p.upg.ability >= MAX_UPGRADE_LEVEL;
}

export function updateUpgrades(game: Game): void {
  const open = shopOpen(game);
  for (const p of game.state.players) {
    const item = p.buyPressed;
    if (item === 0 || !open) continue;
    if (item === BUY_LIFE) {
      // Соло: додаткове життя, раз за матч (DECISIONS.md, п. 12).
      const price = REVIVE.soloLifePrice;
      if (game.state.players.length !== 1 || p.lifeBought || wholeParts(p) < price) {
        emit(game.events, 'purchaseFail', p.x, p.y, 0, 0, p.slot, item);
        continue;
      }
      p.parts -= price;
      p.stats.partsSpent += price;
      p.lifeBought = true;
      p.autoRevives++;
      emit(game.events, 'purchase', p.x, p.y, 0, 0, p.slot, item, 1);
      continue;
    }
    if (item === BUY_MEDKIT) {
      const price = UPGRADES.medkit.price;
      if (p.medkitBought || p.down || p.hp >= p.maxHp || wholeParts(p) < price) {
        emit(game.events, 'purchaseFail', p.x, p.y, 0, 0, p.slot, item);
        continue;
      }
      p.parts -= price;
      p.stats.partsSpent += price;
      p.medkitBought = true;
      p.hp = Math.min(p.maxHp, p.hp + UPGRADES.medkit.heal);
      emit(game.events, 'purchase', p.x, p.y, 0, 0, p.slot, item, 1);
      continue;
    }
    const id = UPGRADE_ORDER[item - 1];
    if (!id) continue;
    const price = upgradePrice(p, id);
    if (price === null || wholeParts(p) < price) {
      emit(game.events, 'purchaseFail', p.x, p.y, 0, 0, p.slot, item);
      continue;
    }
    p.parts -= price;
    p.stats.partsSpent += price;
    p.upg[id]++;
    if (id === 'armor') {
      // Нова броня одразу дає і запас, і поточне здоров'я.
      p.maxHp += UPGRADES.armor.hpPerLevel;
      if (!p.down) p.hp += UPGRADES.armor.hpPerLevel;
    }
    emit(game.events, 'purchase', p.x, p.y, 0, 0, p.slot, item, p.upg[id]);
  }
}
