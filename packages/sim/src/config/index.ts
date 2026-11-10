import { PLAYER } from './balance';
import { CLASSES, AUTOAIM } from './classes';
import { PRESETS, type DifficultyMods } from './difficulty';
import { MAP, type MapDef } from './map';
import { SLICE_WAVES, type WaveDef } from './waves';

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
  waves: SLICE_WAVES,
};

export * from './balance';
export * from './classes';
export * from './difficulty';
export * from './enemies';
export * from './map';
export * from './waves';
