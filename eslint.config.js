// Flat config for ESLint v9+
// See: https://eslint.org/docs/latest/use/configure/migration-guide

// CommonJS here for compatibility with Node 18 in Electron environments
const js = require('@eslint/js');
const importPlugin = require('eslint-plugin-import');
const prettier = require('eslint-config-prettier');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules', 'dist', 'out', '*.min.js'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: { import: importPlugin },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'import/order': ['warn', { 'newlines-between': 'always' }],
    },
  },
  prettier,
];

