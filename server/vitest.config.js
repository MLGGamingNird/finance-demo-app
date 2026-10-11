import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.js'],
    // Integration tests hit a real Supabase stack.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
