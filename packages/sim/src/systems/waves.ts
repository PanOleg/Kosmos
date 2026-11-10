import { PICKUPS, PLAYER_COUNT_MUL } from '../config/waves';
import { AIR_TYPES, SWARM } from '../config/enemies';
import { SWARM_GROUPS } from './enemies';
import { emit } from '../events';
import { secToTicks } from '../math';
import type { Game } from '../state';
import { spawnEnemy } from './enemies';

export type WavePhase = 'pause' | 'active' | 'vacuum' | 'done';

export interface WaveState {
  index: number;
  phase: WavePhase;
  /** Тики до кінця паузи / від старту активної хвилі. */
  timer: number;
  nextGroup: number;
  spawnedTotal: number;
  plannedTotal: number;
  partsMul: number;
  speedMul: number;
  /** Чергування шлюзів для груп з airlock: 'any'. */
  airlockCursor: number;
  /** Лічильник номерів роїв. */
  groupSeq: number;
}

export function createWaveState(): WaveState {
  return {
    index: 0,
    phase: 'pause',
    timer: 0,
    nextGroup: 0,
    spawnedTotal: 0,
    plannedTotal: 0,
    partsMul: 1,
    speedMul: 1,
    airlockCursor: 0,
    groupSeq: 0,
  };
}

function groupCount(game: Game, base: number, air = false): number {
  const n = game.state.players.length;
  const mods = game.config.mods;
  const mul =
    PLAYER_COUNT_MUL[Math.min(n, PLAYER_COUNT_MUL.length - 1)]! *
    mods.enemyCount *
    (air ? mods.droneRate : 1);
  return Math.max(1, Math.round(base * mul));
}

type EnemyTypeArg = Parameters<typeof spawnEnemy>[1];

/** Скільки окремих ворогів дає група (рій — десяток дронів за одиницю). */
function unitsOf(game: Game, type: EnemyTypeArg, base: number): number {
  const c = groupCount(game, base, AIR_TYPES.has(type));
  return type === 'swarm' ? c * SWARM.count : c;
}

export function startWave(game: Game, index: number): void {
  const w = game.state.wave;
  const def = game.config.waves[index]!;
  w.index = index;
  w.phase = 'pause';
  w.timer = secToTicks(def.pause);
  w.nextGroup = 0;
  w.spawnedTotal = 0;
  w.plannedTotal = def.groups.reduce((a, g) => a + unitsOf(game, g.type, g.count), 0);
  w.partsMul = def.partsMul;
  w.speedMul = def.speedMul;
  // Нова пауза — нова аптечка в магазині.
  for (const p of game.state.players) p.medkitBought = false;
  emit(game.events, 'wavePause', 0, 0, 0, 0, index, 0, def.pause);
}

export function updateWaves(game: Game): void {
  const s = game.state;
  const w = s.wave;
  const waves = game.config.waves;
  if (w.phase === 'done') return;
  const def = waves[w.index]!;

  // Після зачистки: деталі злітаються до гравців, потім наступна хвиля або перемога.
  if (w.phase === 'vacuum') {
    let left = 0;
    for (const p of s.pickups) if (p.alive) left++;
    if (--w.timer > 0 && left > 0) return;
    if (w.index + 1 < waves.length) startWave(game, w.index + 1);
    else {
      w.phase = 'done';
      s.phase = 'won';
    }
    return;
  }

  if (w.phase === 'pause') {
    if (--w.timer > 0) return;
    w.phase = 'active';
    w.timer = 0;
    emit(game.events, 'waveStart', 0, 0, 0, 0, w.index);
    return;
  }

  w.timer++;
  while (w.nextGroup < def.groups.length) {
    const g = def.groups[w.nextGroup]!;
    const due = w.timer >= secToTicks(g.at) || s.enemiesAlive < def.pressureBelow;
    if (!due) break;
    spawnGroup(game, g.type, groupCount(game, g.count, AIR_TYPES.has(g.type)), g.airlock);
    w.nextGroup++;
  }

  if (w.nextGroup >= def.groups.length && s.enemiesAlive === 0) {
    // b=1 — це була остання хвиля.
    emit(game.events, 'waveCleared', 0, 0, 0, 0, w.index, w.index + 1 >= waves.length ? 1 : 0);
    w.phase = 'vacuum';
    w.timer = secToTicks(PICKUPS.vacuum);
  }
}

function spawnGroup(game: Game, type: EnemyTypeArg, count: number, airlock: number | 'any'): void {
  const w = game.state.wave;
  const air = AIR_TYPES.has(type);
  // Наземні — зі шлюзів, дрони — з вентиляційних люків у стелі (PROMPT, «Сетинг»).
  const points = air ? game.config.map.vents : game.config.map.airlocks;
  const idx = airlock === 'any' ? w.airlockCursor++ % points.length : airlock % points.length;
  const a = points[idx]!;
  const add = (x: number, y: number, group = -1) => {
    const e = spawnEnemy(game, type, x, y, group);
    if (e >= 0) {
      game.state.enemies[e]!.speed *= w.speedMul;
      w.spawnedTotal++;
    }
  };
  if (type === 'swarm') {
    for (let k = 0; k < count; k++) {
      const group = w.groupSeq++ % SWARM_GROUPS;
      for (let i = 0; i < SWARM.count; i++) {
        const ang = (i / SWARM.count) * Math.PI * 2;
        add(a.x + Math.cos(ang) * 1.2 + k * 2, a.y + Math.sin(ang) * 1.2, group);
      }
    }
    return;
  }
  // Група виходить віялом, усередину арени.
  const inX = -a.x / (Math.hypot(a.x, a.y) || 1);
  const inY = -a.y / (Math.hypot(a.x, a.y) || 1);
  const sideX = -inY;
  const sideY = inX;
  for (let k = 0; k < count; k++) {
    const row = Math.floor(k / 3);
    const col = (k % 3) - 1;
    add(
      a.x + inX * (1.5 + row * 1.2) + sideX * col * 1.2,
      a.y + inY * (1.5 + row * 1.2) + sideY * col * 1.2,
    );
  }
}
