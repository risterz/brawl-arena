import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@brawl-arena/shared': path.resolve(__dirname, 'shared/src/index.ts'),
    },
  },
  test: {
    include: [
      'shared/tests/**/*.test.ts',
      'worker/tests/**/*.test.ts',
      'client/tests/**/*.test.ts',
    ],
    environment: 'node',
  },
});
