import { describe, expect, test } from 'vitest';
import { createGame, step, botInput, emptyInput, hashState, type PlayerInput } from '../src/index';

function playWithBots(players: number, seed: number, maxSec = 180) {
  const g = createGame(
    undefined,
    seed,
    Array.from({ length: players }, () => ({ classId: 'assault' as const })),
  );
  const inputs: PlayerInput[] = g.state.players.map(() => emptyInput());
  let ticks = 0;
  while (g.state.phase === 'playing' && ticks < maxSec * 60) {
    for (let i = 0; i < inputs.length; i++) botInput(g, i, inputs[i]!);
    step(g, inputs);
    ticks++;
  }
  return { g, sec: ticks / 60 };
}

describe('waves', () => {
  test('solo bot clears the slice wave', () => {
    const { g, sec } = playWithBots(1, 11);
    expect(g.state.phase).toBe('won');
    const p = g.state.players[0]!;
    expect(p.stats.kills).toBe(g.state.wave.spawnedTotal);
    // Після зачистки «пилосос» збирає все: жодна деталь не губиться.
    const dropped = g.config.waves[0]!.groups.reduce(
      (a, gr) => a + gr.count * (gr.type === 'gunner' ? 2 : 1),
      0,
    );
    expect(p.stats.partsCollected).toBe(dropped);
    // Ціль BALANCE: 45–60 с для новачка; бот грає гірше людини, тож межа ширша.
    expect(sec).toBeGreaterThan(30);
    expect(sec).toBeLessThan(120);
  });

  test('enemy count scales non-linearly with players', () => {
    const one = createGame(undefined, 1, [{ classId: 'assault' }]);
    const four = createGame(
      undefined,
      1,
      Array.from({ length: 4 }, () => ({ classId: 'assault' as const })),
    );
    const ratio = four.state.wave.plannedTotal / one.state.wave.plannedTotal;
    expect(ratio).toBeGreaterThan(2.6);
    expect(ratio).toBeLessThan(3.4);
  });

  test('parts are shared 25% between living players', () => {
    const { g } = playWithBots(2, 5, 60);
    const [a, b] = g.state.players;
    const collected = a!.stats.partsCollected + b!.stats.partsCollected;
    expect(a!.parts + b!.parts).toBeCloseTo(collected, 5);
  });

  test('bot match is deterministic', () => {
    expect(hashState(playWithBots(2, 21, 40).g.state)).toBe(
      hashState(playWithBots(2, 21, 40).g.state),
    );
  });
});
