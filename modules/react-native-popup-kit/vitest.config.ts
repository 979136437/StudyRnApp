import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'modules/react-native-popup-kit/src/core/**/*.test.ts',
      'modules/react-native-popup-kit/src/components/**/*.test.ts',
      'modules/react-native-popup-kit/src/modal/**/*.test.ts',
      'modules/react-native-popup-kit/src/toast/**/*.test.ts',
    ],
  },
});
