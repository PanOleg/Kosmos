import { describe, expect, test } from 'vitest';
import { createGame, step, MAP, type PlayerInput } from '../src/index';
import { buildWorld, raycast, resolveCircle } from '../src/collision/world';

const hold = (x: number, y: number, dash = false): PlayerInput => ({
  move: { x, y },
  ability: false,
  dash,
});

describe('collision', () => {
  const w = buildWorld(MAP);

  test('player cannot enter reactor core', () => {
    const r = resolveCircle(w, 0.5, 0, 0.5);
    expect(Math.hypot(r.x, r.y)).toBeGreaterThanOrEqual(2.6 + 0.5 - 1e-6);
  });

  test('player stays inside arena', () => {
    const r = resolveCircle(w, -40, 0, 0.5);
    expect(Math.hypot(r.x, r.y)).toBeLessThanOrEqual(MAP.radius - 0.5 + 1e-6);
  });

  test('core blocks shots, broken glass does not', () => {
    expect(raycast(w, -10, 0, 10, 0)).toBeLessThan(1);
    // Через скло лабораторії (x=13, y∈[1.5,6.5]) по горизонталі на y=4.
    expect(raycast(w, 10, 4, 14.5, 4)).toBe(1);
    expect(raycast(w, 10, 4, 14.5, 4, false)).toBeLessThan(1);
  });

  test('walking into the wall for 10 s never tunnels', () => {
    const g = createGame();
    for (let i = 0; i < 600; i++) {
      step(g, [hold(-1, 0, i % 30 === 0)]);
      const p = g.state.players[0]!;
      expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(MAP.radius - 0.5 + 1e-6);
    }
  });

  test('dash covers ~4 m and has cooldown', () => {
    const g = createGame();
    const p = g.state.players[0]!;
    p.x = -20;
    p.y = 0;
    p.vx = 0;
    p.vy = 0;
    step(g, [hold(0, 1, true)]);
    for (let i = 0; i < 11; i++) step(g, [hold(0, 0, true)]);
    expect(p.y).toBeGreaterThan(3.6);
    expect(p.y).toBeLessThan(4.6);
    const y = p.y;
    step(g, [hold(0, 0, false)]);
    step(g, [hold(0, 0, true)]);
    for (let i = 0; i < 12; i++) step(g, [hold(0, 0, false)]);
    expect(p.y - y).toBeLessThan(0.6);
  });
});
