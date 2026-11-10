import { describe, expect, test } from 'vitest';
import {
  buildConfig,
  createGame,
  step,
  botInput,
  emptyInput,
  DEFAULT_SETTINGS,
  MAPS,
  type ClassId,
  type PlayerInput,
} from '../src/index';

describe('desert map', () => {
  test('session setting picks the map; old saves without it get the station', () => {
    expect(buildConfig({ ...DEFAULT_SETTINGS, map: 'desert' }).map.id).toBe('desert');
    expect(buildConfig(DEFAULT_SETTINGS).map.id).toBe('station');
  });

  test('same skeleton as the station: core in the centre, same spawn points', () => {
    const d = MAPS.desert;
    expect(d.obstacles[0]).toMatchObject({ kind: 'circle', x: 0, y: 0, tag: 'core' });
    expect(d.airlocks).toEqual(MAPS.station.airlocks);
    expect(d.vents).toEqual(MAPS.station.vents);
    // Старт гравців вільний від перешкод.
    for (const s of d.playerSpawns)
      for (const o of d.obstacles)
        if (o.kind === 'circle')
          expect(Math.hypot(s.x - o.x, s.y - o.y)).toBeGreaterThan(o.r + 0.6);
  });

  test.each([
    [1, 5],
    [3, 9],
  ])(
    'immortal bots finish the whole match incl. the boss (%i players, seed %i)',
    (n, seed) => {
      const classes: ClassId[] = ['assault', 'engineer', 'medic', 'tech'];
      const g = createGame(
        buildConfig({ ...DEFAULT_SETTINGS, map: 'desert' }),
        seed,
        classes.slice(0, n).map((c) => ({ classId: c })),
      );
      for (const p of g.state.players) p.hp = p.maxHp = 1e9;
      const inputs: PlayerInput[] = g.state.players.map(() => emptyInput());
      let ticks = 0;
      while (g.state.phase === 'playing' && ticks < 60 * 60 * 25) {
        for (let i = 0; i < inputs.length; i++) botInput(g, i, inputs[i]!);
        step(g, inputs);
        ticks++;
      }
      expect(g.state.phase).toBe('won');
    },
    120000,
  );
});
