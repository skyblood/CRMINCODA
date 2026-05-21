import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'tests/**/*.test.js'],
    pool: 'forks',
    testTimeout: 30000,
  },
});
