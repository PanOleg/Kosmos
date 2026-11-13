/** Покращення з BALANCE.md і DECISIONS.md (п. 26). */
export type UpgradeId = 'weapon' | 'armor' | 'ability';

export { BUY_WEAPON, BUY_ARMOR, BUY_ABILITY, BUY_MEDKIT, BUY_LIFE } from '../protocol';

export const UPGRADE_ORDER: UpgradeId[] = ['weapon', 'armor', 'ability'];

export const UPGRADES = {
  weapon: { prices: [10, 20, 35], damagePerLevel: 0.2 },
  armor: { prices: [10, 20, 35], hpPerLevel: 25 },
  ability: { prices: [15, 25, 40], cooldownPerLevel: 0.2 },
  medkit: { price: 8, heal: 50 },
  /** Посилення здібності на 3-му рівні. */
  abilityBoost: {
    overloadDuration: 7,
    shieldHp: 130,
    shieldRadius: 7,
    healPerSecond: 25,
    empRadius: 9,
  },
};

export const MAX_UPGRADE_LEVEL = 3;
