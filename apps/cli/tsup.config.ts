import { defineConfig } from 'tsup';
import { readFileSync } from 'fs';

// Read package.json version at build time
const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'));
const version = packageJson.version;
const name = packageJson.name;

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false, // Disabled due to pre-existing type issues in dependencies
  clean: true,
  target: 'node20',
  platform: 'node',
  treeshake: true,
  splitting: false,
  sourcemap: true,
  minify: false,
  // Bundle workspace packages for npm publish, keep only problematic CJS packages external
  noExternal: [
    '@vibecheck/core',
    '@repo/shared-types',
    '@repo/shared-config',
    '@repo/shared-utils',
  ],
  external: [
    // CJS packages that don't work well bundled in ESM
    '@babel/traverse',
    '@babel/parser',
    '@babel/types',
    'fast-glob',
    'glob',
    'debug',
    // ESM-only packages that should remain external
    'open',
    // Playwright is optional and should remain external
    '@playwright/test',
    'playwright',
    'playwright-core',
    'chromium-bidi',
  ],
  // Environment variables and build-time constants
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
    '__CLI_VERSION__': JSON.stringify(version),
    '__CLI_NAME__': JSON.stringify(name),
  },
});
