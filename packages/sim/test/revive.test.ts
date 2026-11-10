import { describe, expect, test } from 'vitest';
import {
  createGame,
  step,
  reviveCost,
  BUY_LIFE,
  type ClassId,
  type Game,
  type PlayerInput,
} from '../src/index';
import { damagePlayer } from '../src/systems/damage';

const idle = (): PlayerInput => ({ move: { x: 0, y: 0 }, ability: false, dash: false, buy: 0 });
const hold = (): PlayerInput => ({ ...idle(), ability: true });

/** Двоє гравців поруч, без хвиль. */
function duo(rescuer: ClassId = 'assault', parts = 100): Game {
  const g = createGame(undefined, 2, [{ classId: rescuer }, { classId: 'engineer' }]);
  g.config = { ...g.config, waves: [] };
  g.state.wave.phase = 'done';
  const [a, b] = g.state.players;
  a!.x = a!.px = -20;
  b!.x = b!.px = -19;
  a!.y = b!.y = 0;
  a!.parts = parts;
  damagePlayer(g, b!, 999, 0, 0);
  return g;
}

describe('revive', () => {
  test('holding the button next to a downed ally for 3 s revives them and costs parts', () => {
    const g = duo('assault', 100);
    const [a, b] = g.state.players;
    const cost = reviveCost(g, a!);
    // 30% від 100 = 30 > мінімуму 13 на першій хвилі.
    expect(cost).toBe(30);
    for (let i = 0; i < 60 * 3 - 2; i++) step(g, [hold(), idle()]);
    expect(b!.down).toBe(true);
    for (let i = 0; i < 5; i++) step(g, [hold(), idle()]);
    expect(b!.down).toBe(false);
    expect(b!.hp).toBe(Math.round(b!.maxHp / 2));
    expect(a!.parts).toBe(70);
    expect(a!.stats.revives).toBe(1);
  });

  test('releasing the button resets the progress', () => {
    const g = duo();
    const [, b] = g.state.players;
    for (let i = 0; i < 100; i++) step(g, [hold(), idle()]);
    step(g, [idle(), idle()]);
    for (let i = 0; i < 100; i++) step(g, [hold(), idle()]);
    expect(b!.down).toBe(true);
  });

  test('ability does not fire while next to a downed ally', () => {
    const g = duo('assault', 0);
    step(g, [hold(), idle()]);
    expect(g.state.players[0]!.abilityT).toBe(0);
  });

  test('too few parts — no revive; minimum grows with the wave', () => {
    const g = duo('assault', 12);
    for (let i = 0; i < 60 * 4; i++) step(g, [hold(), idle()]);
    expect(g.state.players[1]!.down).toBe(true);
    g.state.wave.index = 4;
    // 10 + 3 × 5 = 25.
    g.state.players[0]!.parts = 0;
    expect(reviveCost(g, g.state.players[0]!)).toBe(25);
  });

  test('medic pays half', () => {
    const g = duo('medic', 100);
    expect(reviveCost(g, g.state.players[0]!)).toBe(15);
  });

  test('a downed player bleeds out after 30 s and returns next wave without parts', () => {
    const g = createGame(undefined, 2, [{ classId: 'assault' }, { classId: 'engineer' }]);
    const b = g.state.players[1]!;
    b.parts = 25;
    damagePlayer(g, b, 999, 0, 0);
    for (let i = 0; i < 60 * 31; i++) step(g, [idle(), idle()]);
    expect(b.out).toBe(true);
    // Наступна хвиля: пауза починається — вибулий повертається.
    while (b.out && g.state.phase === 'playing') {
      for (const e of g.state.enemies) e.alive = false;
      g.state.enemiesAlive = 0;
      step(g, [idle(), idle()]);
    }
    expect(b.down).toBe(false);
    expect(b.parts).toBe(0);
    expect(b.hp).toBe(Math.round(b.maxHp / 2));
  });

  test('match is lost only when everyone is down', () => {
    const g = duo();
    step(g, [idle(), idle()]);
    expect(g.state.phase).toBe('playing');
    damagePlayer(g, g.state.players[0]!, 999, 0, 0);
    step(g, [idle(), idle()]);
    expect(g.state.phase).toBe('lost');
  });

  test('solo: one automatic revive, then a bought extra life, then loss', () => {
    const g = createGame(undefined, 2, [{ classId: 'assault' }]);
    const p = g.state.players[0]!;
    p.parts = 50;
    // Пауза перед першою хвилею: купуємо додаткове життя.
    step(g, [{ ...idle(), buy: BUY_LIFE }]);
    step(g, [idle()]);
    expect(p.autoRevives).toBe(2);
    expect(p.parts).toBe(10);
    for (let k = 0; k < 2; k++) {
      damagePlayer(g, p, 999, 0, 0);
      for (let i = 0; i < 60 * 2 + 5; i++) step(g, [idle()]);
      expect(p.down).toBe(false);
      p.invuln = 0;
    }
    damagePlayer(g, p, 999, 0, 0);
    step(g, [idle()]);
    expect(g.state.phase).toBe('lost');
  });
});
