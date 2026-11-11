import { describe, expect, test } from 'vitest';
import {
  buildConfig,
  createGame,
  step,
  botInput,
  emptyInput,
  DEFAULT_SETTINGS,
  MAPS,
  slowAt,
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
  test('bots walk around quicksand instead of through it', () => {
    // Напарник стоїть за зибучими пісками: гурт тягне бота навпростець, через зону (-15, 9).
    const cfg = buildConfig({ ...DEFAULT_SETTINGS, map: 'desert' });
    const g = createGame(cfg, 1, [{ classId: 'assault' }, { classId: 'medic' }]);
    const [bot, mate] = g.state.players as [
      (typeof g.state.players)[0],
      (typeof g.state.players)[0],
    ];
    bot.x = -19.5;
    bot.y = 9;
    mate.x = -9;
    mate.y = 9;
    const inputs = [emptyInput(), emptyInput()];
    for (let t = 0; t < 240; t++) {
      botInput(g, 0, inputs[0]!);
      step(g, inputs);
      mate.x = -9;
      mate.y = 9;
      expect(slowAt(cfg.map, bot.x, bot.y)).toBe(1);
    }
    // І при цьому таки наблизився до напарника (обійшов), а не застиг перед зоною.
    expect(Math.hypot(bot.x - mate.x, bot.y - mate.y)).toBeLessThan(8.5);
  });
  test('desert scatters a group across several gates; the station keeps one', () => {
    const gates = (map: 'desert' | 'station') => {
      const g = createGame(buildConfig({ ...DEFAULT_SETTINGS, map }), 1, [{ classId: 'assault' }]);
      const inputs = [emptyInput()];
      while (!g.state.enemies.some((e) => e.alive)) step(g, inputs);
      const set = new Set<string>();
      for (const e of g.state.enemies)
        if (e.alive)
          set.add(Math.abs(e.x) > Math.abs(e.y) ? (e.x > 0 ? 'E' : 'W') : e.y > 0 ? 'N' : 'S');
      return set.size;
    };
    expect(gates('station')).toBe(1);
    expect(gates('desert')).toBeGreaterThan(1);
  });

  test('lone palms keep gates, player spawns and slow zones clear', () => {
    const d = MAPS.desert;
    const palms = d.obstacles.filter((o) => o.kind === 'circle' && o.tag === 'palm');
    expect(palms.length).toBeGreaterThanOrEqual(18);
    for (const o of palms) {
      // Лише нові поодинокі пальми; острівці оази стояли біля пісків і раніше.
      if (o.kind !== 'circle' || o.r !== 0.7) continue;
      for (const a of d.airlocks) expect(Math.hypot(a.x - o.x, a.y - o.y)).toBeGreaterThan(6);
      for (const z of d.slowZones ?? [])
        expect(Math.hypot(z.x - o.x, z.y - o.y)).toBeGreaterThan(z.r + o.r + 1);
    }
  });
});
