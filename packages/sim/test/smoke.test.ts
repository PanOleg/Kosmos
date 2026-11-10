import { expect, test } from 'vitest';
import { SIM_VERSION } from '../src/index';

test('sim loads', () => {
  expect(SIM_VERSION).toBe(0);
});
