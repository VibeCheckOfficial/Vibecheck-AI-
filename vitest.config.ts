import { defineConfig } from 'vitest/config';

/**
 * Root vitest configuration for consistent reporting across the monorepo.
 * Package-level configs (apps/cli, tests/e2e) extend or override as needed.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/tests/**/*.test.ts', 'packages/**/*.test.ts'],
    exclude: ['node_modules', 'dist', '**/node_modules/**', 'tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules',
        'dist',
        'tests',
        '**/*.d.ts',
        '**/*.config.ts',
        '**/node_modules/**',
      ],
    },
    testTimeout: 30000,
    reporters: ['default'],
    passWithNoTests: true,
  },
});
