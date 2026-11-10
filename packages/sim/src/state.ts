import type { GameConfig } from './config';
import type { StaticWorld } from './collision/world';
import type { Player } from './entities/player';
import type { EventBuffer } from './events';
import type { RngState } from './rng';

export type MatchPhase = 'playing' | 'won' | 'lost';

/** Усе, що серіалізується й однозначно визначає продовження гри. */
export interface GameState {
  tick: number;
  rng: RngState;
  phase: MatchPhase;
  players: Player[];
}

/** Стан + незмінний контекст (конфіг, підготовлена геометрія) + косметичні події кроку. */
export interface Game {
  config: GameConfig;
  world: StaticWorld;
  state: GameState;
  events: EventBuffer;
}
