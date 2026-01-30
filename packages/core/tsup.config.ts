import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'context/index': 'src/context/index.ts',
    'truthpack/index': 'src/truthpack/index.ts',
    'firewall/index': 'src/firewall/index.ts',
    'validation/index': 'src/validation/index.ts',
    'prompt/index': 'src/prompt/index.ts',
    'agents/index': 'src/agents/index.ts',
    'autofix/index': 'src/autofix/index.ts',
    'ai/index': 'src/ai/index.ts',
    'formatters/index': 'src/formatters/index.ts',
    'formatters/sarif/index': 'src/formatters/sarif/index.ts',
    'secrets/index': 'src/secrets/index.ts',
    'checkpoint/index': 'src/checkpoint/index.ts',
    'cli-registry/index': 'src/cli-registry/index.ts',
    'reality/index': 'src/reality/index.ts',
    'visualization/index': 'src/visualization/index.ts',
    'ci/index': 'src/ci/index.ts',
    'doctor/index': 'src/doctor/index.ts',
    'utils/index': 'src/utils/index.ts',
    'agent-runtime/index': 'src/agent-runtime/index.ts',
    'badges/index': 'src/badges/index.ts',
    'scoring/index': 'src/scoring/index.ts',
    'receipts/index': 'src/receipts/index.ts',
    'integrations/index': 'src/integrations/index.ts',
    'missions/index': 'src/missions/index.ts',
    'storage/index': 'src/storage/index.ts',
    'docguard/index': 'src/docguard/index.ts',
    'discovery/index': 'src/discovery/index.ts',
    'scanners/index': 'src/scanners/index.ts',
  },
  format: ['esm'],
  dts: false, // Skip declaration files due to type errors
  splitting: true,
  sourcemap: true,
  clean: true,
  target: 'node20',
  outDir: 'dist',
  external: [
    '@babel/parser',
    '@babel/traverse',
    '@babel/types',
    'fast-glob',
    'glob',
    'zod',
    'puppeteer',
    '@playwright/test',
    'playwright',
    // Test frameworks should never be bundled
    'vitest',
    // Keep workspace packages external - they'll be bundled by CLI
    '@repo/shared-types',
  ],
  // Skip type checking - pre-existing issues need separate fix
  skipNodeModulesBundle: true,
  treeshake: true,
  // Define test as a no-op to prevent ReferenceError from stray esbuild artifact
  banner: {
    js: 'var test = undefined;',
  },
});
