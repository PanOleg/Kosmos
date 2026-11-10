import { describe, expect, test } from 'vitest';
import { createGame, step, botInput, emptyInput, hashState, type PlayerInput } from '../src/index';

function playWithBots(players: number, seed: number, maxSec = 360) {
  const g = createGame(
    undefined,
    seed,
    Array.from({ length: players }, () => ({ classId: 'assault' as const })),
  );
  const inputs: PlayerInput[] = g.state.players.map(() => emptyInput());
  let ticks = 0;
  // Скільки деталей лежало на підлозі й було вже зібрано в момент зачистки останньої хвилі.
  let atClear: { onFloor: number; collected: number } | null = null;
  const collected = () => g.state.players.reduce((a, p) => a + p.stats.partsCollected, 0);
  let spawned = 0;
  while (g.state.phase === 'playing' && ticks < maxSec * 60) {
    for (let i = 0; i < inputs.length; i++) botInput(g, i, inputs[i]!);
    step(g, inputs);
    for (let i = 0; i < g.events.count; i++) if (g.events.list[i]!.type === 'spawn') spawned++;
    for (let i = 0; i < g.events.count; i++)
      if (g.events.list[i]!.type === 'waveCleared' && g.events.list[i]!.b === 1)
        atClear = {
          onFloor: g.state.pickups.filter((k) => k.alive).length,
          collected: collected(),
        };
    ticks++;
  }
  return { g, sec: ticks / 60, atClear, collected: collected(), spawned };
}

describe('waves', () => {
  test('solo bot clears all waves', () => {
    const { g, sec, atClear, collected, spawned } = playWithBots(1, 11);
    expect(g.state.phase).toBe('won');
    const p = g.state.players[0]!;
    expect(p.stats.kills).toBe(spawned);
    // Після зачистки «пилосос» збирає все, що лежало на підлозі: нічого не губиться.
    // (Деталь, що пролежала 25 с недосяжною для бота, згасає ще під час хвилі — так задумано.)
    expect(atClear).not.toBeNull();
    expect(collected).toBe(atClear!.collected + atClear!.onFloor);
    expect(p.stats.partsCollected).toBeGreaterThan(20);
    // Три хвилі з паузами: орієнтир ~2–3 хв; бот грає інакше за людину, тож межа ширша.
    expect(sec).toBeGreaterThan(90);
    expect(sec).toBeLessThan(300);
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
