import { describe, expect, test } from 'vitest';
import { createGame, step, botInput, emptyInput, type ClassId } from '../src/index';

/**
 * Боти-напарники без безсмертя (DECISIONS.md, п. 57): четвірка має проходити «Нормально»
 * з босом. Якщо тест упав — бот розучився ухилятись (Камікадзе, зони ракет і кранів) або
 * змінився баланс.
 */
describe('teammate bots', () => {
  test('a bot comes to the rally point when called', () => {
    const run = (rally: { x: number; y: number } | null) => {
      const g = createGame(undefined, 1, [{ classId: 'assault' }]);
      const inputs = [emptyInput()];
      for (let t = 0; t < 300; t++) {
        botInput(g, 0, inputs[0]!, rally);
        step(g, inputs);
      }
      const p = g.state.players[0]!;
      return Math.hypot(p.x - 6, p.y + 5);
    };
    // Точка в реакторній залі, по той бік ядра від старту.
    expect(run({ x: 6, y: -5 })).toBeLessThan(4.5);
    expect(run(null)).toBeGreaterThan(9);
  });

  test.each([1, 2, 3])(
    'a full bot crew wins on normal (seed %i)',
    (seed) => {
      const classes: ClassId[] = ['assault', 'engineer', 'medic', 'tech'];
      const g = createGame(
        undefined,
        seed,
        classes.map((c) => ({ classId: c })),
      );
      const inputs = g.state.players.map(() => emptyInput());
      let ticks = 0;
      while (g.state.phase === 'playing' && ticks < 60 * 60 * 30) {
        for (let i = 0; i < inputs.length; i++) botInput(g, i, inputs[i]!);
        step(g, inputs);
        ticks++;
      }
      expect(g.state.phase).toBe('won');
    },
    120000,
  );
});
