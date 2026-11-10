import { describe, expect, test } from 'vitest';
import { createGame, step, type PlayerInput } from '../src/index';
import { hashState } from '../src/serialize';
import { createRng, rand } from '../src/rng';

function scriptedInputs(seed: number, ticks: number): PlayerInput[][] {
  const r = createRng(seed);
  const out: PlayerInput[][] = [];
  let mx = 0;
  let my = 0;
  for (let t = 0; t < ticks; t++) {
    if (t % 20 === 0) {
      mx = rand(r) * 2 - 1;
      my = rand(r) * 2 - 1;
    }
    out.push([{ move: { x: mx, y: my }, ability: false, dash: t % 45 < 3 }]);
  }
  return out;
}

function run(seed: number, inputs: PlayerInput[][]): number {
  const g = createGame(undefined, seed);
  for (const inp of inputs) step(g, inp);
  return hashState(g.state);
}

describe('determinism', () => {
  test('same seed + inputs → same state', () => {
    const inputs = scriptedInputs(7, 60 * 30);
    expect(run(42, inputs)).toBe(run(42, inputs));
  });

  test('different seed → different rng state', () => {
    const a = createGame(undefined, 1);
    const b = createGame(undefined, 2);
    expect(a.state.rng.s).not.toBe(b.state.rng.s);
  });
});
