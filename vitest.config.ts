import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests exercise the wallet SDK against the local devnet,
    // which uses global WebSocket state and RxJS subscriptions. The 'forks'
    // pool isolates each file in its own process and is the most robust
    // against native-module / ws surprises.
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    testTimeout: 180_000,
    hookTimeout: 300_000,
    fileParallelism: false,
    include: ['tests/**/*.test.ts'],
  },
});
