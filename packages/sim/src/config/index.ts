import { PLAYER } from './balance';
import { CLASSES, AUTOAIM } from './classes';
import { PRESETS, type DifficultyMods } from './difficulty';
import { MAP, MAPS, type MapDef, type MapId } from './map';
import { buildWaves, type WaveDef } from './waves';

export interface GameConfig {
  map: MapDef;
  player: typeof PLAYER;
  classes: typeof CLASSES;
  autoaim: typeof AUTOAIM;
  mods: DifficultyMods;
  waves: WaveDef[];
}

export const DEFAULT_CONFIG: GameConfig = {
  map: MAP,
  player: PLAYER,
  classes: CLASSES,
  autoaim: AUTOAIM,
  mods: PRESETS.normal,
  waves: buildWaves(9),
};

export type PresetId = keyof typeof PRESETS;

/** Налаштування сесії з лобі: пресет, необов'язкові ручні множники (0.5–2) і кількість хвиль (5–15). */
export interface SessionSettings {
  preset: PresetId;
  custom: Partial<Record<CustomMod, number>> | null;
  waves: number;
  /** Карта (п. 49); старі збереження без неї — станція. */
  map?: MapId;
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
  return { ...DEFAULT_CONFIG, map, mods, waves: buildWaves(waves) };
}

export * from './balance';
export * from './classes';
export * from './difficulty';
export * from './enemies';
export * from './map';
export * from './waves';
export * from './upgrades';
export * from './revive';
