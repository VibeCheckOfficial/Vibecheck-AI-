import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false, // Disabled due to pre-existing type issues in dependencies
  clean: true,
  sourcemap: true,
  minify: false,
  target: 'node20',
  external: [
    '@actions/core',
    '@actions/github',
    '@actions/exec',
    '@octokit/rest',
  ],
});
