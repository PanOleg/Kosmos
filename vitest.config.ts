import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Тести симуляції програють десятки секунд гри; паралельно їм потрібен запас.
  test: { include: ['packages/*/test/**/*.test.ts'], testTimeout: 30000 },
});
