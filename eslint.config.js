import js from '@eslint/js'
import parser from '@babel/eslint-parser'
import stylistic from '@stylistic/eslint-plugin'

const functionStatement = {
  selector: [
    'FunctionDeclaration',
    'ExportNamedDeclaration[declaration.type="FunctionDeclaration"]',
    'ExportDefaultDeclaration[declaration.type="FunctionDeclaration"]',
    'VariableDeclaration:has(> VariableDeclarator > :matches(ArrowFunctionExpression, FunctionExpression))',
    'ExportNamedDeclaration:has(> VariableDeclaration > VariableDeclarator > ' +
      ':matches(ArrowFunctionExpression, FunctionExpression))',
  ].join(', '),
}

const typeDiscipline = [
  {
    selector: 'TSAnyKeyword',
    message: 'Use unknown and validate external values.',
  },
  {
    selector: 'TSAsExpression:not([typeAnnotation.typeName.name="const"])',
    message: 'Narrow or validate values instead of asserting their types.',
  },
  {
    selector: 'TSTypeAssertion',
    message: 'Narrow or validate values instead of asserting their types.',
  },
  {
    selector: 'TSNonNullExpression',
    message: 'Check for null or undefined instead of asserting presence.',
  },
]

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
      '@stylistic/padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: 'import', next: '*' },
        { blankLine: 'any', prev: 'import', next: 'import' },
        { blankLine: 'always', prev: functionStatement, next: '*' },
        { blankLine: 'always', prev: '*', next: functionStatement },
      ],
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
    rules: {
      'no-debugger': 'error',
      'no-constant-condition': 'error',
      'no-restricted-syntax': ['error', ...typeDiscipline],
      'no-warning-comments': [
        'error',
        { terms: ['@ts-ignore', '@ts-nocheck'], location: 'anywhere' },
      ],
    },
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...typeDiscipline,
        {
          selector: 'TSAsExpression',
          message: 'Validate unknown input instead of asserting its type.',
        },
        {
          selector: 'Literal[regex]',
          message: 'Use structured parsing in business code.',
        },
      ],
    },
  },
]
