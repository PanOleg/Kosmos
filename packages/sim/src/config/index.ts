import { PLAYER } from './balance';
import { CLASSES, AUTOAIM } from './classes';
import { PRESETS, type DifficultyMods } from './difficulty';
import { MAP, MAPS, type MapDef, type MapId } from './map';
import { buildWaves, dronesOnly, type WaveDef } from './waves';

/** Правила матчу поверх пресету складності — їх змінюють модифікатори (п. 60). */
export interface MatchRules {
  /** Множник деталей з ворогів. */
  partsMul: number;
  /** Множник шкоди гравців. */
  playerDamageMul: number;
  /** Множник паузи між хвилями. */
  pauseMul: number;
  /** Магазин між хвилями відкритий. */
  shop: boolean;
}
export const DEFAULT_RULES: MatchRules = {
  partsMul: 1,
  playerDamageMul: 1,
  pauseMul: 1,
  shop: true,
};

/**
 * Модифікатори матчу: rich — удвічі більше деталей, вороги швидші; glass — усі б'ють удвічі
 * сильніше; drones — лише дрони; noShop — без магазину; rush — паузи вдвічі коротші.
 */
export const MODIFIERS = ['rich', 'glass', 'drones', 'noShop', 'rush'] as const;
export type ModifierId = (typeof MODIFIERS)[number];

export interface GameConfig {
  map: MapDef;
  player: typeof PLAYER;
  classes: typeof CLASSES;
  autoaim: typeof AUTOAIM;
  mods: DifficultyMods;
  waves: WaveDef[];
  rules: MatchRules;
  /** Нескінченний режим і ввімкнені модифікатори — для підсумку й рекордів. */
  endless: boolean;
  modifiers: ModifierId[];
}

export const DEFAULT_CONFIG: GameConfig = {
  map: MAP,
  player: PLAYER,
  classes: CLASSES,
  autoaim: AUTOAIM,
  mods: PRESETS.normal,
  waves: buildWaves(9),
  rules: DEFAULT_RULES,
  endless: false,
  modifiers: [],
};

export type PresetId = keyof typeof PRESETS;

/** Налаштування сесії з лобі: пресет, необов'язкові ручні множники (0.5–2) і кількість хвиль (5–15). */
export interface SessionSettings {
  preset: PresetId;
  custom: Partial<Record<CustomMod, number>> | null;
  waves: number;
  /** Карта (п. 49); старі збереження без неї — станція. */
  map?: MapId;
  /** Модифікатори матчу (п. 60). */
  modifiers?: ModifierId[];
  /** Нескінченний режим: після Ядра хвилі тривають. */
  endless?: boolean;
}

/** Повзунки розширених налаштувань; шкода ворогів іде за пресетом. */
export const CUSTOM_MODS = [
  'enemyCount',
  'enemyHp',
  'enemySpeed',
  'aggression',
  'droneRate',
] as const;
export type CustomMod = (typeof CUSTOM_MODS)[number];
export const MOD_RANGE = { min: 0.5, max: 2 } as const;
export const WAVES_RANGE = { min: 5, max: 15, default: 9 } as const;

export const DEFAULT_SETTINGS: SessionSettings = { preset: 'normal', custom: null, waves: 9 };

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Конфіг матчу з налаштувань сесії; некоректні значення обрізаються до допустимих. */
export function buildConfig(s: SessionSettings): GameConfig {
  const base = PRESETS[s.preset] ?? PRESETS.normal;
  const mods: DifficultyMods = { ...base };
  if (s.custom)
    for (const k of CUSTOM_MODS) {
      const v = s.custom[k];
      if (typeof v === 'number' && Number.isFinite(v))
        mods[k] = clamp(v, MOD_RANGE.min, MOD_RANGE.max);
    }
  const waves = Math.round(clamp(s.waves || WAVES_RANGE.default, WAVES_RANGE.min, WAVES_RANGE.max));
  const map = (s.map && MAPS[s.map]) || MAP;
  const active = new Set((s.modifiers ?? []).filter((m) => MODIFIERS.includes(m)));
  const rules: MatchRules = { ...DEFAULT_RULES };
  if (active.has('rich')) {
    rules.partsMul = 2;
    mods.enemySpeed *= 1.2;
  }
  if (active.has('glass')) {
    rules.playerDamageMul = 2;
    mods.enemyDamage *= 2;
  }
  if (active.has('noShop')) rules.shop = false;
  if (active.has('rush')) rules.pauseMul = 0.5;
  let list = buildWaves(waves, !!s.endless);
  if (active.has('drones')) list = dronesOnly(list);
  return {
    ...DEFAULT_CONFIG,
    map,
    mods,
    waves: list,
    rules,
    endless: !!s.endless,
    modifiers: MODIFIERS.filter((m) => active.has(m)),
  };
}

export * from './balance';
export * from './classes';
export * from './difficulty';
export * from './enemies';
export * from './map';
export * from './waves';
export * from './upgrades';
export * from './revive';
