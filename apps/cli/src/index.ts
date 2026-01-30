#!/usr/bin/env node
/**
 * VibeCheck CLI - Hallucination prevention for AI-assisted development
 *
 * A premium CLI tool for generating truthpacks, validating code,
 * and detecting hallucinations in AI-generated content.
 */

import { Command, InvalidArgumentError } from 'commander';
import updateNotifier from 'update-notifier';
import { printBanner } from './ui/theme.js';
import {
  renderHelp,
  renderCommandHelp,
  showInteractiveMenu,
  showLoginScreen,
  printSuccess,
  printError,
  printWarning,
} from './ui/index.js';
import {
  env,
  getEnvironment,
  registerShutdownHandlers,
  createLogger,
  wrapError,
  VibeCheckError,
  isVerbose,
  isQuiet,
} from './lib/index.js';
import {
  scanCommand,
  validateCommand,
  checkCommand,
  initCommand,
  configCommand,
  watchCommand,
  doctorCommand,
  shipCommand,
  reportCommand,
  fixCommand,
  traceCommand,
  quickstartCommand,
  badgeCommand,
  shareCommand,
} from './commands/index.js';

// Package info for update notifier - version injected at build time
import { CLI_VERSION, CLI_NAME } from './lib/version.js';
const pkg = {
  name: CLI_NAME,
  version: CLI_VERSION,
};

// Global state for cleanup
let isShuttingDown = false;
const cleanupCallbacks: Array<() => void | Promise<void>> = [];

/**
 * Register a cleanup callback for graceful shutdown
 */
export function onCleanup(callback: () => void | Promise<void>): void {
  cleanupCallbacks.push(callback);
}

/**
 * Perform graceful shutdown
 */
async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  const logger = createLogger({ level: 'info' });

  if (env.isInteractive) {
    logger.newline();
    logger.info(`Received ${signal}, shutting down gracefully...`);
  }

  // Run cleanup callbacks in reverse order
  for (let i = cleanupCallbacks.length - 1; i >= 0; i--) {
    try {
      await cleanupCallbacks[i]();
    } catch {
      // Ignore cleanup errors
    }
  }

  process.exit(signal === 'SIGTERM' ? 0 : 130);
}

// Register shutdown handlers
registerShutdownHandlers(async () => {
  await gracefulShutdown('SIGINT');
});

// Check for updates (async, non-blocking)
if (!env.isCI) {
  try {
    updateNotifier({ pkg, updateCheckInterval: 1000 * 60 * 60 * 24 }).notify({
      isGlobal: true,
      message:
        'Update available {currentVersion} → {latestVersion}\n' +
        'Run {updateCommand} to update',
    });
  } catch {
    // Ignore update check errors
  }
}

/**
 * Parse integer with validation
 */
function parseInteger(value: string, name: string): number {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new InvalidArgumentError(`${name} must be a valid integer`);
  }
  return parsed;
}

/**
 * Parse positive integer with validation
 */
function parsePositiveInteger(value: string, name: string): number {
  const parsed = parseInteger(value, name);
  if (parsed <= 0) {
    throw new InvalidArgumentError(`${name} must be a positive integer`);
  }
  return parsed;
}

/**
 * Validate file path argument
 */
function validatePath(value: string): string {
  if (!value || value.trim() === '') {
    throw new InvalidArgumentError('Path cannot be empty');
  }
  return value.trim();
}

// Create the main program
const program = new Command();

program
  .name('vibecheck')
  .description('Hallucination prevention for AI-assisted development')
  .version(pkg.version, '-v, --version', 'Output the current version')
  .option('--verbose', 'Enable verbose output')
  .option('--quiet', 'Suppress non-essential output')
  .option('--json', 'Output in JSON format')
  .option('-c, --config <path>', 'Path to configuration file', validatePath)
  .option('--no-color', 'Disable colored output')
  .option('--no-banner', 'Suppress the ASCII banner')
  .configureOutput({
    writeErr: (str) => process.stderr.write(str),
    writeOut: (str) => process.stdout.write(str),
    outputError: (str, write) => {
      write(`\n${str}`);
    },
  })
  .hook('preAction', (thisCommand) => {
    // Apply environment overrides from options
    const opts = thisCommand.opts();

    // Set verbose/quiet from env vars if not specified
    if (!opts.verbose && isVerbose()) {
      opts.verbose = true;
    }
    if (!opts.quiet && isQuiet()) {
      opts.quiet = true;
    }
  });

/**
 * Helper to add custom help to commands
 */
function addCustomHelp(cmd: Command, cmdName: string): Command {
  cmd.on('option:help', () => {
    renderCommandHelp(cmdName);
    process.exit(0);
  });
  return cmd;
}

// Init command
addCustomHelp(
  program
    .command('init')
    .description('Initialize VibeCheck in your project')
    .option('-f, --force', 'Overwrite existing configuration')
    .option('-q, --quick', 'Quick mode: auto-scan, show Ship Score and top issues')
    .option(
      '-t, --template <template>',
      'Configuration template (minimal, standard, strict)',
      (value) => {
        const valid = ['minimal', 'standard', 'strict'];
        if (!valid.includes(value)) {
          throw new InvalidArgumentError(
            `Template must be one of: ${valid.join(', ')}`
          );
        }
        return value as 'minimal' | 'standard' | 'strict';
      }
    )
    .option('--forge', 'Generate AI context rules (Cursor, Windsurf, etc.)')
    .option('--connect', 'Connect VibeCheck to your CI/CD pipeline')
    .option('--ship-gate', 'Include ship gate in CI/CD (use with --connect)')
    .action(async (options, command) => {
      const globalOpts = command.optsWithGlobals();
      await initCommand({
        ...options,
        ...globalOpts,
      });
    }),
  'init'
);

// Quick Start command - Interactive onboarding
program
  .command('quickstart')
  .alias('start')
  .description('Interactive setup wizard for new users')
  .option('--skip-prompts', 'Run without interactive prompts')
  .action(async (options, command) => {
    const globalOpts = command.optsWithGlobals();
    await quickstartCommand({
      ...options,
      ...globalOpts,
    });
  });

// Scan command
program
  .command('scan')
  .description('Scan codebase and generate truthpack')
  .option('-o, --output <path>', 'Output path for truthpack', validatePath)
  .option('-i, --include <patterns...>', 'Include patterns')
  .option('-e, --exclude <patterns...>', 'Exclude patterns')
  .option(
    '--timeout <ms>',
    'Scan timeout in milliseconds',
    (v) => parsePositiveInteger(v, 'timeout')
  )
  .option('--force', 'Force regeneration even if truthpack exists')
  .action(async (options, command) => {
    const globalOpts = command.optsWithGlobals();
    await scanCommand({
      ...options,
      ...globalOpts,
    });
  });

// Validate command
program
  .command('validate [files...]')
  .description('Validate files against truthpack')
  .option('-s, --strict', 'Enable strict validation')
  .option('--fix', 'Attempt to fix issues automatically')
  .option(
    '--max-errors <count>',
    'Maximum number of errors to report',
    (v) => parsePositiveInteger(v, 'max-errors')
  )
  .option(
    '--timeout <ms>',
    'Validation timeout in milliseconds',
    (v) => parsePositiveInteger(v, 'timeout')
  )
  .action(async (files, options, command) => {
    const globalOpts = command.optsWithGlobals();
    await validateCommand(files, {
      ...options,
      ...globalOpts,
    });
  });

// Check command
program
  .command('check')
  .description('Run hallucination and drift detection')
  .option('-s, --strict', 'Enable strict checking')
  .option('--fail-fast', 'Stop on first error')
  .option(
    '--timeout <ms>',
    'Check timeout in milliseconds',
    (v) => parsePositiveInteger(v, 'timeout')
  )
  .action(async (options, command) => {
    const globalOpts = command.optsWithGlobals();
    await checkCommand({
      ...options,
      failFast: options.failFast,
      ...globalOpts,
    });
  });

// Trace command - Data flow analysis
program
  .command('trace [target]')
  .description('Trace data flow from sources to sinks')
  .option('-f, --format <format>', 'Output format (text, json, mermaid)', 'text')
  .option('-o, --output <path>', 'Output file path')
  .option('--max-depth <n>', 'Maximum path depth', (v) => parsePositiveInteger(v, 'max-depth'))
  .option('--show-all', 'Show all paths, not just issues')
  .action(async (target, options, command) => {
    const globalOpts = command.optsWithGlobals();
    await traceCommand({
      target,
      format: options.format,
      output: options.output,
      maxDepth: options.maxDepth,
      showAll: options.showAll,
      ...globalOpts,
    });
  });

// Config command
program
  .command('config')
  .description('View or edit configuration')
  .option('--get <key>', 'Get a configuration value')
  .option('--set <key=value>', 'Set a configuration value')
  .option('--list', 'List all configuration values')
  .option('--validate', 'Validate the configuration file')
  .option('--path', 'Show the configuration file path')
  .action(async (options, command) => {
    const globalOpts = command.optsWithGlobals();
    await configCommand({
      ...options,
      ...globalOpts,
    });
  });

// Watch command
program
  .command('watch')
  .description('Watch for changes and validate continuously')
  .option(
    '-d, --debounce <ms>',
    'Debounce delay in milliseconds',
    (v) => parsePositiveInteger(v, 'debounce')
  )
  .option('--once', 'Run validation once and exit')
  .action(async (options, command) => {
    const globalOpts = command.optsWithGlobals();
    await watchCommand({
      ...options,
      ...globalOpts,
    });
  });

// Doctor command
program
  .command('doctor')
  .description('Validate system dependencies and configuration')
  .action(async (options, command) => {
    const globalOpts = command.optsWithGlobals();
    await doctorCommand({
      ...globalOpts,
    });
  });

// Badge command - Generate README badge embed codes
program
  .command('badge')
  .description('Generate badge embed code for your README')
  .option('-p, --project-id <id>', 'Project ID from dashboard')
  .option('-s, --style <style>', 'Badge style (flat, flat-square, plastic, for-the-badge)', 'flat')
  .option('-f, --format <format>', 'Output format (markdown, html, url)', 'markdown')
  .action(async (options, command) => {
    const globalOpts = command.optsWithGlobals();
    await badgeCommand({
      projectId: options.projectId,
      style: options.style,
      format: options.format,
      ...globalOpts,
    });
  });

// Share command - Share Ship Score on social media
program
  .command('share')
  .description('Share your Ship Score on social media')
  .option('-p, --project-id <id>', 'Project ID from dashboard')
  .option('--platform <platform>', 'Share platform (twitter, linkedin, copy)')
  .option('--score <score>', 'Score to share (uses latest scan if not provided)', parseInt)
  .action(async (options, command) => {
    const globalOpts = command.optsWithGlobals();
    await shareCommand({
      projectId: options.projectId,
      platform: options.platform,
      score: options.score,
      ...globalOpts,
    });
  });

// Ship command
program
  .command('ship')
  .description('Pre-deployment checks with optional auto-fix')
  .option('--fix', 'Auto-fix issues before shipping')
  .option('--force', 'Proceed despite blockers')
  .option('--strict', 'Stricter pre-deploy checks')
  .option('--reality', 'Enable Reality Mode (auto-starts your app, runs browser tests)')
  .option('--reality-url <url>', 'Use existing server instead of auto-starting')
  .option(
    '--reality-timeout <seconds>',
    'Reality Mode timeout in seconds',
    (v) => parsePositiveInteger(v, 'reality-timeout')
  )
  .option(
    '--reality-startup-timeout <seconds>',
    'Server startup timeout in seconds',
    (v) => parsePositiveInteger(v, 'reality-startup-timeout')
  )
  .option('--reality-headless', 'Run browser in headless mode', true)
  .option('--no-reality-headless', 'Run browser in headed mode (see browser)')
  .option('--chaos', 'Enable AI Chaos Agent (autonomous bug hunting)')
  .option('--chaos-aggressive', 'Aggressive chaos mode (includes security tests)')
  .option(
    '--chaos-actions <number>',
    'Maximum chaos actions to perform',
    (v) => parsePositiveInteger(v, 'chaos-actions')
  )
  .option('--chaos-provider <provider>', 'AI provider: ollama (free, local), anthropic, openai, local', 'ollama')
  .option('--chaos-model <model>', 'Model to use (default: llava for ollama, gpt-4o for openai)')
  .option('--chaos-url <url>', 'Base URL for ollama/local provider (default: http://localhost:11434)')
  .option('--chaos-api-key <key>', 'API key for anthropic/openai (or use OPENAI_API_KEY/ANTHROPIC_API_KEY env)')
  .option('--chaos-no-vision', 'Disable vision (DOM-only mode, works with any LLM)')
  .action(async (options, command) => {
    const globalOpts = command.optsWithGlobals();
    
    await shipCommand({
      ...options,
      reality: options.reality,
      realityUrl: options.realityUrl,
      realityTimeout: options.realityTimeout,
      realityStartupTimeout: options.realityStartupTimeout,
      realityHeadless: options.realityHeadless,
      chaos: options.chaos,
      chaosAggressive: options.chaosAggressive,
      chaosActions: options.chaosActions,
      chaosProvider: options.chaosProvider,
      chaosModel: options.chaosModel,
      chaosUrl: options.chaosUrl,
      chaosApiKey: options.chaosApiKey,
      chaosNoVision: options.chaosNoVision,
      ...globalOpts,
    });
  });

// Fix command - Apply auto-fixes for detected issues
program
  .command('fix [files...]')
  .description('Apply auto-fixes for detected issues')
  .option('-a, --apply', 'Apply fixes automatically without review')
  .option('-i, --interactive', 'Interactive mode - review each fix')
  .option('-d, --dry-run', 'Show fixes without applying')
  .option('-r, --rollback <transactionId>', 'Rollback a previous fix transaction')
  .option(
    '--confidence <threshold>',
    'Minimum confidence threshold (0-1)',
    (v) => {
      const parsed = parseFloat(v);
      if (isNaN(parsed) || parsed < 0 || parsed > 1) {
        throw new InvalidArgumentError('Confidence must be a number between 0 and 1');
      }
      return parsed;
    }
  )
  .action(async (files, options, command) => {
    const globalOpts = command.optsWithGlobals();
    await fixCommand({
      files: files.length > 0 ? files : undefined,
      ...options,
      ...globalOpts,
    });
  });

// Report command - Generate enterprise-grade reports
program
  .command('report')
  .description('Generate enterprise-grade HTML/PDF reports')
  .option(
    '-t, --type <type>',
    'Report type (reality-check, ship-readiness, executive-summary, detailed-technical, compliance)',
    (value) => {
      const valid = ['reality-check', 'ship-readiness', 'executive-summary', 'detailed-technical', 'compliance'];
      if (!valid.includes(value)) {
        throw new InvalidArgumentError(`Report type must be one of: ${valid.join(', ')}`);
      }
      return value;
    }
  )
  .option(
    '-f, --format <format>',
    'Output format (html, pdf)',
    (value) => {
      const valid = ['html', 'pdf'];
      if (!valid.includes(value)) {
        throw new InvalidArgumentError(`Format must be one of: ${valid.join(', ')}`);
      }
      return value;
    }
  )
  .option('-o, --output <path>', 'Output file path', validatePath)
  .option(
    '--theme <theme>',
    'Color theme (dark, light)',
    (value) => {
      const valid = ['dark', 'light'];
      if (!valid.includes(value)) {
        throw new InvalidArgumentError(`Theme must be one of: ${valid.join(', ')}`);
      }
      return value;
    }
  )
  .option('--branding <name>', 'Company name for report branding')
  .option('--open', 'Open report in browser after generation')
  .action(async (options, command) => {
    const globalOpts = command.optsWithGlobals();
    await reportCommand({
      ...options,
      ...globalOpts,
    });
  });

// Menu command - Interactive mode for vibecoders
program
  .command('menu')
  .description('Open interactive menu')
  .action(async () => {
    await runInteractiveMode();
  });

// Login command
program
  .command('login')
  .description('Login to VibeCheck Cloud')
  .action(async () => {
    const session = await showLoginScreen();
    if (session) {
      printSuccess(`Welcome, ${session.name}! You're now connected to VibeCheck Cloud.`);
    }
  });

// Logout command
program
  .command('logout')
  .description('Logout from VibeCheck Cloud')
  .action(async () => {
    const { clearCredentials, hasCredentials } = await import('./lib/credentials.js');
    
    const wasLoggedIn = await hasCredentials();
    if (!wasLoggedIn) {
      printWarning('You are not currently logged in.');
      return;
    }
    
    await clearCredentials();
    printSuccess('Logged out successfully. See you next time!');
  });

// Custom help - override default help behavior
program.helpOption('-h, --help', 'Display gorgeous help');
program.on('option:help', () => {
  renderHelp();
  process.exit(0);
});

// When no command is provided, show interactive menu
program.action(async () => {
  await runInteractiveMode();
});

/**
 * Run interactive menu mode
 */
async function runInteractiveMode(): Promise<void> {
  while (true) {
    const selection = await showInteractiveMenu();
    
    if (!selection || selection === 'exit') {
      break;
    }
    
    const globalOpts = program.opts();
    
    try {
      switch (selection) {
        case 'scan':
          await scanCommand({ ...globalOpts });
          break;
        case 'check':
          await checkCommand({ ...globalOpts });
          break;
        case 'validate':
          await validateCommand([], { ...globalOpts });
          break;
        case 'fix':
          await fixCommand({ interactive: true, ...globalOpts });
          break;
        case 'ship':
          await shipCommand({ ...globalOpts });
          break;
        case 'report':
          await reportCommand({ type: 'reality-check', format: 'html', ...globalOpts });
          break;
        case 'watch':
          await watchCommand({ ...globalOpts });
          break;
        case 'init':
          await initCommand({ ...globalOpts });
          break;
        case 'config':
          await configCommand({ list: true, ...globalOpts });
          break;
        case 'doctor':
          await doctorCommand({ ...globalOpts });
          break;
        case 'login':
          const session = await showLoginScreen();
          if (session) {
            printSuccess(`Welcome, ${session.name}!`);
          }
          break;
        case 'help':
          renderHelp();
          break;
        default:
          break;
      }
    } catch (error) {
      const wrapped = wrapError(error);
      printError(wrapped.message);
    }
    
    // Pause before returning to menu
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// Error handling
program.exitOverride((err) => {
  if (err.code === 'commander.help') {
    process.exit(0);
  }
  if (err.code === 'commander.version') {
    process.exit(0);
  }
  if (err.code === 'commander.helpDisplayed') {
    process.exit(0);
  }
  throw err;
});

// Global error handler for unhandled rejections
process.on('unhandledRejection', (reason) => {
  const logger = createLogger({
    json: program.opts().json,
    level: 'error',
  });
  const error = wrapError(reason);
  logger.logError(error);
  process.exit(1);
});

// Global error handler for uncaught exceptions
process.on('uncaughtException', (error) => {
  const logger = createLogger({
    json: program.opts().json,
    level: 'error',
  });
  const wrapped = wrapError(error);
  logger.logError(wrapped);
  process.exit(1);
});

// Parse and execute
async function main(): Promise<void> {
  try {
    // Initialize temp cleanup system (crash-safe)
    try {
      const { initTempCleanup } = await import('@vibecheck/core/utils');
      await initTempCleanup();
    } catch {
      // Ignore if temp cleanup not available (non-critical)
    }

    // Check Node.js version
    const nodeEnv = getEnvironment();
    if (nodeEnv.nodeVersion.major < 18) {
      throw new VibeCheckError(
        `Node.js 18 or higher is required (current: ${process.version})`,
        'VERSION_MISMATCH',
        {
          suggestions: [
            'Upgrade Node.js to version 18 or higher',
            'Use nvm to manage Node.js versions',
          ],
        }
      );
    }

    // Parse arguments
    await program.parseAsync(process.argv);
  } catch (error) {
    // Don't double-log errors that were already handled
    if (isShuttingDown) return;

    const opts = program.opts();
    const logger = createLogger({
      json: opts.json,
      level: opts.verbose ? 'debug' : 'error',
    });

    const wrapped = wrapError(error);
    logger.logError(wrapped);

    // Exit with appropriate code
    process.exit(wrapped.severity === 'fatal' ? 2 : 1);
  }
}

main();

// Export for programmatic use
export { defineConfig } from './lib/config.js';
export type { VibeCheckConfig } from './lib/config.js';
export { VibeCheckError } from './lib/errors.js';
export type { ErrorCode } from './lib/errors.js';
