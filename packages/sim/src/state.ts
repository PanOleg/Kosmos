import type { GameConfig } from './config';
import type { CoverPoints } from './collision/cover';
import type { SpatialHash } from './collision/spatial';
import type { StaticWorld } from './collision/world';
import type { Barrier } from './entities/barrier';
import type { Enemy } from './entities/enemy';
import type { Player } from './entities/player';
import type { Pickup } from './entities/pickup';
import type { Projectile } from './entities/projectile';
import type { EventBuffer } from './events';
import type { RngState } from './rng';
import type { NavField } from './systems/navigation';
import type { WaveState } from './systems/waves';

export type MatchPhase = 'playing' | 'won' | 'lost';

/** Усе, що серіалізується й однозначно визначає продовження гри. */
export interface GameState {
  tick: number;
  rng: RngState;
  phase: MatchPhase;
  players: Player[];
  enemies: Enemy[];
  projectiles: Projectile[];
  pickups: Pickup[];
  barriers: Barrier[];
  enemiesAlive: number;
  wave: WaveState;
  /** Дробовий залишок деталей між дропами. */
  partsCarry: number;
}

/**
 * Стан + незмінний контекст + похідні структури, що перебудовуються з GameState
 * (сітка ворогів, поле навігації) + косметичні події кроку.
 * Поле навігації оновлюється раз на кілька тиків; симулює лише хост/сервер, тож
 * відновлення точно з середини інтервалу не потрібне.
 */
export interface Game {
  config: GameConfig;
  world: StaticWorld;
  state: GameState;
  events: EventBuffer;
  hash: SpatialHash;
  nav: NavField;
  cover: CoverPoints;
}
