import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '.playwright-mcp/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['packages/sim/src/**/*.ts'],
    rules: {
      // Детермінізм: у симуляції лише rng із сідом і крок симуляції.
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use sim rng' },
        { object: 'Date', property: 'now', message: 'Use sim tick' },
        { object: 'performance', property: 'now', message: 'Use sim tick' },
      ],
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
