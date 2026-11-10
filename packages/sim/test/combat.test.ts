import { describe, expect, test } from 'vitest';
import {
  createGame,
  step,
  spawnEnemy,
  hashState,
  SCOUT_WINDUP,
  type PlayerInput,
  type Game,
} from '../src/index';
import { updateAutoaim } from '../src/systems/autoaim';
import { clearHash, insertHash } from '../src/collision/spatial';

const idle = (): PlayerInput => ({ move: { x: 0, y: 0 }, ability: false, dash: false });

function place(g: Game, x: number, y: number) {
  const p = g.state.players[0]!;
  p.x = p.px = x;
  p.y = p.py = y;
  return p;
}

function rehash(g: Game) {
  clearHash(g.hash);
  g.state.enemies.forEach((e, i) => e.alive && insertHash(g.hash, i, e.x, e.y));
}

describe('combat', () => {
  test('autoaim shoots and kills a scout in range', () => {
    const g = createGame();
    place(g, -15, 0);
    const idx = spawnEnemy(g, 'scout', -6, 0);
    let killed = false;
    for (let i = 0; i < 120 && !killed; i++) {
      step(g, [idle()]);
      killed = !g.state.enemies[idx]!.alive;
    }
    expect(killed).toBe(true);
    expect(g.state.players[0]!.stats.kills).toBe(1);
  });

  test('scouts reach a passive player and deal damage', () => {
    const g = createGame();
    const p = place(g, -15, 0);
    // Безсмертний гравець без зброї: перевіряємо лише поведінку Скаутів.
    p.classId = 'assault';
    g.config = {
      ...g.config,
      classes: {
        ...g.config.classes,
        assault: {
          ...g.config.classes.assault,
          weapon: { ...g.config.classes.assault.weapon, range: 0 },
        },
      },
    };
    spawnEnemy(g, 'scout', 20, 0);
    for (let i = 0; i < 60 * 12; i++) step(g, [idle()]);
    expect(p.stats.damageTaken).toBeGreaterThan(0);
  });

  test('scout navigates around containers to the player', () => {
    const g = createGame();
    g.config = {
      ...g.config,
      classes: {
        ...g.config.classes,
        assault: {
          ...g.config.classes.assault,
          weapon: { ...g.config.classes.assault.weapon, range: 0 },
        },
      },
    };
    const p = place(g, 0, 25.5);
    const idx = spawnEnemy(g, 'scout', 0, 9);
    let minD = Infinity;
    for (let i = 0; i < 60 * 10; i++) {
      step(g, [idle()]);
      const e = g.state.enemies[idx]!;
      minD = Math.min(minD, Math.hypot(e.x - p.x, e.y - p.y));
    }
    expect(minD).toBeLessThan(2);
  });

  test('dash during windup avoids the hit', () => {
    const g = createGame();
    g.config = {
      ...g.config,
      classes: {
        ...g.config.classes,
        assault: {
          ...g.config.classes.assault,
          weapon: { ...g.config.classes.assault.weapon, range: 0 },
        },
      },
    };
    const p = place(g, -15, 0);
    const idx = spawnEnemy(g, 'scout', -10, 0);
    let dashed = false;
    for (let i = 0; i < 60 * 3; i++) {
      const e = g.state.enemies[idx]!;
      const dash = !dashed && e.ai === SCOUT_WINDUP;
      if (dash) dashed = true;
      step(g, [{ move: { x: 0, y: dash ? 1 : 0 }, ability: false, dash }]);
      if (dashed) break;
    }
    for (let i = 0; i < 25; i++) step(g, [{ move: { x: 0, y: 1 }, ability: false, dash: false }]);
    expect(dashed).toBe(true);
    expect(p.stats.damageTaken).toBe(0);
  });

  test('autoaim prefers a winding-up scout over a closer idle one', () => {
    const g = createGame();
    place(g, -15, 0);
    const near = spawnEnemy(g, 'scout', -12, 0);
    const far = spawnEnemy(g, 'scout', -15, 5);
    g.state.enemies[far]!.ai = SCOUT_WINDUP;
    rehash(g);
    updateAutoaim(g);
    expect(g.state.players[0]!.target).toBe(far);
    expect(near).not.toBe(far);
  });

  test('full fight is deterministic', () => {
    const run = () => {
      const g = createGame(undefined, 99);
      place(g, -15, 0);
      for (let k = 0; k < 6; k++) spawnEnemy(g, 'scout', 20, -3 + k);
      for (let i = 0; i < 60 * 15; i++)
        step(g, [
          {
            move: { x: Math.sin(i / 50), y: Math.cos(i / 70) },
            ability: false,
            dash: i % 90 === 0,
          },
        ]);
      return hashState(g.state);
    };
    expect(run()).toBe(run());
  });
});
