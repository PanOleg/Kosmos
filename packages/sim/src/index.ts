import { buildWorld } from './collision/world';
import { DEFAULT_CONFIG, type ClassId, type GameConfig } from './config';
import { createPlayer } from './entities/player';
import { createEventBuffer } from './events';
import { createRng } from './rng';
import type { PlayerInput } from './protocol';
import type { Game, GameState } from './state';
import { updatePlayers } from './systems/movement';

export interface PlayerSlotSetup {
  classId: ClassId;
}

export const PLAYER_BASE_HP = 120;

export function createGame(
  config: GameConfig = DEFAULT_CONFIG,
  seed = 1,
  slots: PlayerSlotSetup[] = [{ classId: 'assault' }],
): Game {
  const spawns = config.map.playerSpawns;
  const state: GameState = {
    tick: 0,
    rng: createRng(seed),
    phase: 'playing',
    players: slots.map((s, i) => {
      const sp = spawns[i % spawns.length]!;
      return createPlayer(i, s.classId, sp.x, sp.y, PLAYER_BASE_HP);
    }),
  };
  return { config, world: buildWorld(config.map), state, events: createEventBuffer() };
}

/**
 * Один крок 1/60 с. inputs[slot] — ввід гравця в цьому слоті.
 * Мутує game.state на місці (без алокацій) і повертає його; знімок для мережі — через serialize.
 */
export function step(game: Game, inputs: readonly PlayerInput[]): GameState {
  game.events.count = 0;
  const s = game.state;
  if (s.phase !== 'playing') return s;
  updatePlayers(game, inputs);
  s.tick++;
  return s;
}

export * from './config';
export * from './protocol';
export * from './state';
export * from './events';
export * from './math';
export type { Player } from './entities/player';
export { hasLineOfSight, raycast } from './collision/world';
export { serializeState, hashState } from './serialize';
