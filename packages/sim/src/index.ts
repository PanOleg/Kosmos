import { buildCover } from './collision/cover';
import { createSpatialHash } from './collision/spatial';
import { buildWorld } from './collision/world';
import { DEFAULT_CONFIG, type ClassId, type GameConfig } from './config';
import { createEnemyPool } from './entities/enemy';
import { createPlayer } from './entities/player';
import { createPickupPool } from './entities/pickup';
import { createBarrierPool } from './entities/barrier';
import { createRocketPool } from './entities/rocket';
import { createPropPool } from './entities/prop';
import { DYNAMIC_SLOTS } from './collision/world';
import { buildPerches } from './collision/perches';
import { createProjectilePool } from './entities/projectile';
import { createEventBuffer } from './events';
import { createRng } from './rng';
import type { PlayerInput } from './protocol';
import type { Game, GameState } from './state';
import { updateAutoaim } from './systems/autoaim';
import { updateAbilities } from './systems/abilities';
import { updateUpgrades } from './systems/upgrades';
import { updateRockets } from './systems/rockets';
import { allLost, updateRevive } from './systems/revive';
import { REVIVE } from './config/revive';
import { updatePlayerFire, updateProjectiles } from './systems/combat';
import { updateEnemies } from './systems/enemies';
import { updatePlayers } from './systems/movement';
import { buildNav, updateNav } from './systems/navigation';
import { updatePickups } from './systems/pickups';
import { createWaveState, startWave, updateWaves } from './systems/waves';

export interface PlayerSlotSetup {
  classId: ClassId;
}

const ENEMY_CAPACITY = 192;
const PROJECTILE_CAPACITY = 768;
const PICKUP_CAPACITY = 256;

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
    pickups: createPickupPool(PICKUP_CAPACITY),
    barriers: createBarrierPool(4),
    rockets: createRocketPool(24),
    props: createPropPool(DYNAMIC_SLOTS),
    enemiesAlive: 0,
    wave: createWaveState(),
    partsCarry: 0,
  };
  const world = buildWorld(config.map);
  const game: Game = {
    config,
    world,
    state,
    events: createEventBuffer(),
    hash: createSpatialHash(config.map.radius + 2, 2, ENEMY_CAPACITY),
    nav: buildNav(world, 0.45),
    cover: buildCover(world, 0.6, 0.8),
    perches: buildPerches(world),
  };
  // Соло-запобіжник: автопідйом раз на матч (DECISIONS.md, п. 12).
  if (state.players.length === 1) state.players[0]!.autoRevives = REVIVE.soloAuto;
  updateNav(game.nav, state);
  if (config.waves.length > 0) startWave(game, 0);
  else state.wave.phase = 'done';
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
  updateUpgrades(game);
  updateRevive(game);
  updateAbilities(game);
  updateWaves(game);
  updateEnemies(game);
  updateRockets(game);
  updateAutoaim(game);
  updatePlayerFire(game);
  updateProjectiles(game);
  updatePickups(game);
  if (allLost(game)) s.phase = 'lost';
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
export type { Pickup } from './entities/pickup';
export type { WaveState, WavePhase } from './systems/waves';
export { TEAM_PLAYER, TEAM_ENEMY } from './entities/projectile';
export { hasLineOfSight, raycast } from './collision/world';
export { spawnEnemy } from './systems/enemies';
export { threatOf } from './systems/autoaim';
export { serializeState, hashState } from './serialize';
export { SCOUT_WINDUP } from './ai/scout';
export { botInput } from './ai/playerBot';
export { WASP_WINDUP } from './ai/wasp';
export { KAMI_WINDUP, KAMI_DIVE } from './ai/kamikaze';
export { SNIPER_AIM } from './ai/sniper';
export {
  SPIDER_CLIMB,
  SPIDER_PERCH,
  SPIDER_WINDUP,
  SPIDER_FLIGHT,
  SPIDER_LANDED,
} from './ai/spider';
export type { Rocket } from './entities/rocket';
export type { Prop } from './entities/prop';
export { FOREMAN_STRIKE } from './ai/foreman';
export { TURRET_WINDUP, TURRET_BURST } from './ai/turret';
export { abilityReadiness, ABILITY_CLASS_INDEX } from './systems/abilities';
export { shopOpen, upgradePrice, wholeParts } from './systems/upgrades';
export { reviveCost, downedAllyNear } from './systems/revive';
export type { Barrier } from './entities/barrier';
export { GUNNER_HIDE, GUNNER_PEEK, GUNNER_SEEK, GUNNER_OPEN, GUNNER_RETURN } from './ai/gunner';
