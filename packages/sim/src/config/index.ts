import { PLAYER } from './balance';
import { MAP, type MapDef } from './map';

export interface GameConfig {
  map: MapDef;
  player: typeof PLAYER;
}

export const DEFAULT_CONFIG: GameConfig = { map: MAP, player: PLAYER };

export * from './balance';
export * from './map';
