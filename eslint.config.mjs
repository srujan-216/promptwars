import js from '@eslint/js';
import next from '@next/eslint-plugin-next';
import prettier from 'eslint-config-prettier';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

const rootDir = dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'coverage/**'],
  },

  js.configs.recommended,

  // recommendedTypeChecked rather than strictTypeChecked: a deliberate, time-boxed
  // trade-off for the submission deadline. The rules that actually enforce CLAUDE.md
  // rule 1 (no any, no ts-ignore) are re-raised to `error` below, so the
  // non-negotiable stays mechanically enforced either way.
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: rootDir,
      },
    },
  },

  jsxA11y.flatConfigs.recommended,

  // @next/eslint-plugin-next ships a real flat config, so no FlatCompat shim is needed.
  next.flatConfig.coreWebVitals,

  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/consistent-type-imports': 'warn',
    },
  },

  // CLAUDE.md rule 12 / conventions: server-only code must never reach a client
  // component. Scoped to components/, where client components live — server code
  // importing server code is normal and must stay allowed, as must route handlers
  // under app/api. The `server-only` package is the real mechanical guard (it makes
  // such an import a build error); this rule is a faster, more legible second line.
  {
    files: ['components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/lib/server/*', '@/lib/server/**'],
              message:
                'Server-only modules must not be imported from a client component. Pass the data in as props from a server component instead.',
            },
          ],
        },
      ],
    },
  },

  // Config and setup files sit outside the typed project graph.
  {
    files: ['**/*.config.{js,mjs,ts}', 'vitest.setup.ts'],
    ...tseslint.configs.disableTypeChecked,
  },

  // Must stay last: turns off every rule Prettier owns.
  prettier,
);
