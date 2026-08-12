import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/api/**/*.test.ts',
      'src/api/**/*.test.tsx',
      'src/core/**/*.test.ts',
      'src/components/**/*.test.ts',
      'src/modal/**/*.test.ts',
      'src/toast/**/*.test.ts',
    ],
  },
});
