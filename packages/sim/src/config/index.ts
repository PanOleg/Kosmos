import { PLAYER } from './balance';
import { CLASSES, AUTOAIM } from './classes';
import { PRESETS, type DifficultyMods } from './difficulty';
import { MAP, type MapDef } from './map';

export interface GameConfig {
  map: MapDef;
  player: typeof PLAYER;
  classes: typeof CLASSES;
  autoaim: typeof AUTOAIM;
  mods: DifficultyMods;
}

export const DEFAULT_CONFIG: GameConfig = {
  map: MAP,
  player: PLAYER,
  classes: CLASSES,
  autoaim: AUTOAIM,
  mods: PRESETS.normal,
};

export * from './balance';
export * from './classes';
export * from './difficulty';
export * from './enemies';
export * from './map';
