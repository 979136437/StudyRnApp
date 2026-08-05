import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'react-native': fileURLToPath(
        new URL('./src/core/__tests__/react-native.mock.ts', import.meta.url),
      ),
    },
  },
});
