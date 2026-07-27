const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['.agents/**', '.claude/**', '.codegraph/**', 'dist/**'],
  },
]);
