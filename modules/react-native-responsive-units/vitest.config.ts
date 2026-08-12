import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'react-native': fileURLToPath(
        new URL('./src/__tests__/react-native.mock.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
  },
});
