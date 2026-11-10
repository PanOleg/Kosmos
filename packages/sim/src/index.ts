import { createSpatialHash } from './collision/spatial';
import { buildWorld } from './collision/world';
import { DEFAULT_CONFIG, type ClassId, type GameConfig } from './config';
import { createEnemyPool } from './entities/enemy';
import { createPlayer } from './entities/player';
import { createProjectilePool } from './entities/projectile';
import { createEventBuffer } from './events';
import { createRng } from './rng';
import type { PlayerInput } from './protocol';
import type { Game, GameState } from './state';
import { updateAutoaim } from './systems/autoaim';
import { updatePlayerFire, updateProjectiles } from './systems/combat';
import { updateEnemies } from './systems/enemies';
import { updatePlayers } from './systems/movement';
import { buildNav, updateNav } from './systems/navigation';

export interface PlayerSlotSetup {
  classId: ClassId;
}

const ENEMY_CAPACITY = 192;
const PROJECTILE_CAPACITY = 768;

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
      return createPlayer(i, s.classId, sp.x, sp.y, config.classes[s.classId].hp);
    }),
    enemies: createEnemyPool(ENEMY_CAPACITY),
    projectiles: createProjectilePool(PROJECTILE_CAPACITY),
    enemiesAlive: 0,
  };
  const world = buildWorld(config.map);
  const game: Game = {
    config,
    world,
    state,
    events: createEventBuffer(),
    hash: createSpatialHash(config.map.radius + 2, 2, ENEMY_CAPACITY),
    nav: buildNav(world, 0.45),
  };
  updateNav(game.nav, state);
  return game;
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
  updateEnemies(game);
  updateAutoaim(game);
  updatePlayerFire(game);
  updateProjectiles(game);
  if (s.players.every((p) => p.down)) s.phase = 'lost';
  s.tick++;
  return s;
}

export * from './config';
export * from './protocol';
export * from './state';
export * from './events';
export * from './math';
export type { Player } from './entities/player';
export type { Enemy } from './entities/enemy';
export type { Projectile } from './entities/projectile';
export { TEAM_PLAYER, TEAM_ENEMY } from './entities/projectile';
export { hasLineOfSight, raycast } from './collision/world';
export { spawnEnemy } from './systems/enemies';
export { threatOf } from './systems/autoaim';
export { serializeState, hashState } from './serialize';
export { SCOUT_WINDUP } from './ai/scout';
