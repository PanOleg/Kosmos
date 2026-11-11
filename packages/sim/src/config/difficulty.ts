/** Множники над базовим конфігом; пресети з BALANCE.md + агресивність з DECISIONS.md. */
export interface DifficultyMods {
  enemyCount: number;
  enemyHp: number;
  enemySpeed: number;
  enemyDamage: number;
  droneRate: number;
  aggression: number;
  /** Частка дронів у одному рої від SWARM.count (рішення користувача, п. 70). */
  swarmSize: number;
}

export const PRESETS: Record<'easy' | 'normal' | 'hard', DifficultyMods> = {
  easy: {
    enemyCount: 0.7,
    enemyHp: 0.8,
    enemySpeed: 0.9,
    enemyDamage: 0.7,
    droneRate: 0.7,
    aggression: 0.8,
    swarmSize: 0.7,
  },
  normal: {
    enemyCount: 1,
    enemyHp: 1,
    enemySpeed: 1,
    enemyDamage: 1,
    droneRate: 1,
    aggression: 1,
    swarmSize: 0.7,
  },
  hard: {
    enemyCount: 1.3,
    enemyHp: 1.3,
    enemySpeed: 1.1,
    enemyDamage: 1.4,
    droneRate: 1.3,
    aggression: 1.25,
    swarmSize: 1,
  },
};

/** Скільки дронів у одному рої за цієї складності. */
export function swarmCount(mods: DifficultyMods, base: number): number {
  return Math.max(1, Math.round(base * mods.swarmSize));
}
