import { describe, expect, test } from 'vitest';
import { createGame, step, botInput, emptyInput, type ClassId } from '../src/index';

/**
 * Боти-напарники без безсмертя (DECISIONS.md, п. 57): четвірка має проходити «Нормально»
 * з босом. Якщо тест упав — бот розучився ухилятись (Камікадзе, зони ракет і кранів) або
 * змінився баланс.
 */
describe('teammate bots', () => {
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
