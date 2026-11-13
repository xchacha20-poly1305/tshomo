import js from '@eslint/js'
import parser from '@babel/eslint-parser'
import stylistic from '@stylistic/eslint-plugin'

// Babel parses TS syntax without depending on the compiler's JavaScript API.
// TypeScript 7 performs the type/unused-symbol checks in bun run typecheck.
export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  {
    files: ['**/*.{js,mjs,ts}'],
    plugins: { '@stylistic': stylistic },
    rules: {
      '@stylistic/max-len': ['error', { code: 120 }],
      '@stylistic/nonblock-statement-body-position': ['error', 'beside'],
      '@stylistic/max-statements-per-line': ['error', { max: 1 }],
      curly: ['error', 'all'],
    },
  },
  {
    ...js.configs.recommended,
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', URL: 'readonly' },
    },
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: { plugins: ['@babel/plugin-syntax-typescript'] },
      },
    },
    rules: { 'no-debugger': 'error', 'no-constant-condition': 'error' },
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSAsExpression',
          message: 'Validate unknown input instead of asserting its type.',
        },
        {
          selector: 'TSAnyKeyword',
          message: 'Use unknown and validate external values.',
        },
        {
          selector: 'Literal[regex]',
          message: 'Use structured parsing in business code.',
        },
      ],
    },
  },
]
