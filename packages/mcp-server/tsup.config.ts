import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  target: 'node20',
  platform: 'node',
  treeshake: true,
  splitting: false,
  sourcemap: true,
  minify: false,
  outDir: 'dist',
  // Bundle workspace packages for npm publish
  noExternal: [
    '@vibecheck/core',
    '@repo/shared-config',
    '@repo/shared-types',
    '@repo/shared-utils',
  ],
  external: [
    // Keep MCP SDK external (user needs to install)
    '@modelcontextprotocol/sdk',
    // CJS packages that don't bundle well
    'glob',
    'ws',
  ],
  // Shebang is added in src/index.ts
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
  },
});
