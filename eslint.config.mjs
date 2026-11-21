import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**'] },
  {
    files: ['packages/*/src/**/*.ts'],
    extends: [tseslint.configs.recommended],
  },
  {
    // ADR 0003: the engine must stay pure so the server and web app agree and fast-check can drive it.
    files: ['packages/engine/src/**/*.ts'],
    ignores: ['packages/engine/src/**/*.test.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...['Date', 'fetch', 'setTimeout', 'setInterval', 'crypto', 'performance', 'window', 'document', 'process', 'localStorage'].map(
          (name) => ({ name, message: 'The engine must be pure: pass time, ids and randomness in as inputs.' }),
        ),
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'The engine must be deterministic: pass randomness in as an input.' },
      ],
      'no-restricted-imports': [
        'error',
        { patterns: [{ regex: '^[^.]', message: 'The engine has no runtime dependencies: only relative imports.' }] },
      ],
    },
  },
);
