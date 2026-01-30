/**
 * Gorgeous Help System
 * 
 * Beautiful ASCII-styled help output for the VibeCheck CLI
 */

import chalk from 'chalk';
import gradient from 'gradient-string';

// Custom gradient for VibeCheck branding
const vibeGradient = gradient(['#00d9ff', '#00ff88', '#ff00ff']);
const commandGradient = gradient(['#ff6b6b', '#feca57', '#48dbfb']);
const optionGradient = gradient(['#5f27cd', '#341f97']);

/**
 * Main VIBECHECK ASCII logo for help
 */
const LOGO = `
██╗   ██╗██╗██████╗ ███████╗ ██████╗██╗  ██╗███████╗ ██████╗██╗  ██╗
██║   ██║██║██╔══██╗██╔════╝██╔════╝██║  ██║██╔════╝██╔════╝██║ ██╔╝
██║   ██║██║██████╔╝█████╗  ██║     ███████║█████╗  ██║     █████╔╝ 
╚██╗ ██╔╝██║██╔══██╗██╔══╝  ██║     ██╔══██║██╔══╝  ██║     ██╔═██╗ 
 ╚████╔╝ ██║██████╔╝███████╗╚██████╗██║  ██║███████╗╚██████╗██║  ██╗
  ╚═══╝  ╚═╝╚═════╝ ╚══════╝ ╚═════╝╚═╝  ╚═╝╚══════╝ ╚═════╝╚═╝  ╚═╝
`;

/**
 * Command definitions with descriptions and examples
 */
interface CommandDef {
  name: string;
  description: string;
  usage: string;
  options: Array<{
    flag: string;
    description: string;
    default?: string;
  }>;
  examples: string[];
  icon: string;
}

const COMMANDS: CommandDef[] = [
  {
    name: 'init',
    description: 'Initialize VibeCheck in your project',
    usage: 'vibecheck init [options]',
    icon: '🚀',
    options: [
      { flag: '-f, --force', description: 'Overwrite existing configuration' },
      { flag: '-t, --template <type>', description: 'Template: minimal | standard | strict', default: 'standard' },
    ],
    examples: [
      'vibecheck init',
      'vibecheck init --template strict',
      'vibecheck init -f',
    ],
  },
  {
    name: 'scan',
    description: 'Scan codebase and generate truthpack',
    usage: 'vibecheck scan [options]',
    icon: '🔍',
    options: [
      { flag: '-o, --output <path>', description: 'Output path for truthpack' },
      { flag: '-i, --include <patterns...>', description: 'Include patterns' },
      { flag: '-e, --exclude <patterns...>', description: 'Exclude patterns' },
      { flag: '--timeout <ms>', description: 'Scan timeout in milliseconds' },
      { flag: '--force', description: 'Force regeneration' },
    ],
    examples: [
      'vibecheck scan',
      'vibecheck scan --output ./truthpack',
      'vibecheck scan -i "src/**/*.ts" -e "**/*.test.ts"',
    ],
  },
  {
    name: 'check',
    description: 'Run hallucination and drift detection',
    usage: 'vibecheck check [options]',
    icon: '🛡️',
    options: [
      { flag: '-s, --strict', description: 'Enable strict checking' },
      { flag: '--fail-fast', description: 'Stop on first error' },
      { flag: '--timeout <ms>', description: 'Check timeout in milliseconds' },
    ],
    examples: [
      'vibecheck check',
      'vibecheck check --strict',
      'vibecheck check --fail-fast',
    ],
  },
  {
    name: 'validate',
    description: 'Validate files against truthpack',
    usage: 'vibecheck validate [files...] [options]',
    icon: '✅',
    options: [
      { flag: '-s, --strict', description: 'Enable strict validation' },
      { flag: '--fix', description: 'Attempt to fix issues automatically' },
      { flag: '--max-errors <count>', description: 'Maximum errors to report' },
    ],
    examples: [
      'vibecheck validate',
      'vibecheck validate src/',
      'vibecheck validate --fix',
    ],
  },
  {
    name: 'ship',
    description: 'Pre-deployment checks with optional auto-fix',
    usage: 'vibecheck ship [options]',
    icon: '🚢',
    options: [
      { flag: '--fix', description: 'Auto-fix issues before shipping' },
      { flag: '--force', description: 'Proceed despite blockers' },
      { flag: '--strict', description: 'Stricter pre-deploy checks' },
    ],
    examples: [
      'vibecheck ship',
      'vibecheck ship --fix',
      'vibecheck ship --force',
    ],
  },
  {
    name: 'fix',
    description: 'Apply auto-fixes for detected issues',
    usage: 'vibecheck fix [files...] [options]',
    icon: '🔧',
    options: [
      { flag: '-a, --apply', description: 'Apply fixes automatically without review' },
      { flag: '-i, --interactive', description: 'Interactive mode - review each fix' },
      { flag: '-d, --dry-run', description: 'Show fixes without applying' },
      { flag: '-r, --rollback <id>', description: 'Rollback a previous fix transaction' },
      { flag: '--confidence <0-1>', description: 'Minimum confidence threshold', default: '0.8' },
    ],
    examples: [
      'vibecheck fix',
      'vibecheck fix --dry-run',
      'vibecheck fix --interactive',
      'vibecheck fix src/api/',
      'vibecheck fix --rollback tx-abc123',
    ],
  },
  {
    name: 'report',
    description: 'Generate enterprise-grade HTML/PDF reports',
    usage: 'vibecheck report [options]',
    icon: '📊',
    options: [
      { flag: '-t, --type <type>', description: 'Report type (reality-check, ship-readiness, executive-summary, detailed-technical, compliance)', default: 'reality-check' },
      { flag: '-f, --format <format>', description: 'Output format (html, pdf)', default: 'html' },
      { flag: '-o, --output <path>', description: 'Output file path' },
      { flag: '--theme <theme>', description: 'Theme (dark, light)', default: 'dark' },
      { flag: '--branding <company>', description: 'Company name for branding' },
      { flag: '--open', description: 'Open report in browser after generation' },
    ],
    examples: [
      'vibecheck report',
      'vibecheck report --type ship-readiness',
      'vibecheck report --format pdf --output report.pdf',
      'vibecheck report --branding "Acme Inc" --open',
    ],
  },
  {
    name: 'watch',
    description: 'Watch for changes and validate continuously',
    usage: 'vibecheck watch [options]',
    icon: '👁️',
    options: [
      { flag: '-d, --debounce <ms>', description: 'Debounce delay in milliseconds' },
      { flag: '--once', description: 'Run validation once and exit' },
    ],
    examples: [
      'vibecheck watch',
      'vibecheck watch --debounce 500',
    ],
  },
  {
    name: 'doctor',
    description: 'Validate system dependencies and configuration',
    usage: 'vibecheck doctor [options]',
    icon: '🩺',
    options: [],
    examples: [
      'vibecheck doctor',
    ],
  },
  {
    name: 'config',
    description: 'View or edit configuration',
    usage: 'vibecheck config [options]',
    icon: '⚙️',
    options: [
      { flag: '--get <key>', description: 'Get a configuration value' },
      { flag: '--set <key=value>', description: 'Set a configuration value' },
      { flag: '--list', description: 'List all configuration values' },
      { flag: '--validate', description: 'Validate configuration file' },
    ],
    examples: [
      'vibecheck config --list',
      'vibecheck config --get strict',
      'vibecheck config --validate',
    ],
  },
];

/**
 * Global options
 */
const GLOBAL_OPTIONS = [
  { flag: '-v, --version', description: 'Output the current version' },
  { flag: '--verbose', description: 'Enable verbose output' },
  { flag: '--quiet', description: 'Suppress non-essential output' },
  { flag: '--json', description: 'Output in JSON format' },
  { flag: '-c, --config <path>', description: 'Path to configuration file' },
  { flag: '--no-color', description: 'Disable colored output' },
  { flag: '--no-banner', description: 'Suppress the ASCII banner' },
  { flag: '-h, --help', description: 'Display help information' },
];

/**
 * Draw a styled box
 */
function drawBox(content: string[], width: number = 80): string {
  const lines: string[] = [];
  const border = chalk.cyan;
  
  lines.push(border('╔' + '═'.repeat(width - 2) + '╗'));
  
  for (const line of content) {
    const visibleLength = line.replace(/\x1b\[[0-9;]*m/g, '').length;
    const padding = Math.max(0, width - 4 - visibleLength);
    lines.push(border('║') + '  ' + line + ' '.repeat(padding) + border('║'));
  }
  
  lines.push(border('╚' + '═'.repeat(width - 2) + '╝'));
  
  return lines.join('\n');
}

/**
 * Render the main help screen
 */
export function renderHelp(): void {
  console.log('');
  
  // Logo with gradient
  console.log(vibeGradient(LOGO));
  
  // Tagline
  console.log(chalk.dim('  ' + '─'.repeat(68)));
  console.log(chalk.white.bold('  🔮 Hallucination Prevention for AI-Assisted Development'));
  console.log(chalk.dim('  ' + '─'.repeat(68)));
  console.log('');
  
  // Usage
  console.log(chalk.white.bold('  USAGE'));
  console.log('');
  console.log('    ' + chalk.cyan('vibecheck') + chalk.dim(' <command>') + chalk.yellow(' [options]'));
  console.log('');
  
  // Commands section
  console.log(chalk.white.bold('  COMMANDS'));
  console.log('');
  
  for (const cmd of COMMANDS) {
    console.log(
      '    ' +
      cmd.icon + ' ' +
      chalk.cyan.bold(cmd.name.padEnd(12)) +
      chalk.dim(cmd.description)
    );
  }
  
  console.log('');
  
  // Global options
  console.log(chalk.white.bold('  GLOBAL OPTIONS'));
  console.log('');
  
  for (const opt of GLOBAL_OPTIONS) {
    console.log(
      '    ' +
      chalk.yellow(opt.flag.padEnd(24)) +
      chalk.dim(opt.description)
    );
  }
  
  console.log('');
  
  // Quick examples
  console.log(chalk.white.bold('  QUICK START'));
  console.log('');
  console.log('    ' + chalk.dim('# Initialize a new project'));
  console.log('    ' + chalk.green('$ vibecheck init'));
  console.log('');
  console.log('    ' + chalk.dim('# Scan and generate truthpack'));
  console.log('    ' + chalk.green('$ vibecheck scan'));
  console.log('');
  console.log('    ' + chalk.dim('# Check for hallucinations'));
  console.log('    ' + chalk.green('$ vibecheck check'));
  console.log('');
  console.log('    ' + chalk.dim('# Pre-deploy verification'));
  console.log('    ' + chalk.green('$ vibecheck ship'));
  console.log('');
  
  // Footer
  console.log(chalk.dim('  ' + '─'.repeat(68)));
  console.log('');
  console.log('  ' + chalk.dim('Run') + ' vibecheck ' + chalk.cyan('<command>') + ' --help ' + chalk.dim('for detailed command help'));
  console.log('  ' + chalk.dim('Run') + ' vibecheck ' + chalk.magenta('menu') + '         ' + chalk.dim('for interactive mode'));
  console.log('');
  console.log('  ' + chalk.dim('Documentation:') + ' ' + chalk.cyan.underline('https://vibecheck.dev/docs'));
  console.log('  ' + chalk.dim('Report issues:') + ' ' + chalk.cyan.underline('https://github.com/vibecheck/cli/issues'));
  console.log('');
}

/**
 * Render help for a specific command
 */
export function renderCommandHelp(commandName: string): void {
  const cmd = COMMANDS.find(c => c.name === commandName);
  
  if (!cmd) {
    console.log(chalk.red(`\n  Unknown command: ${commandName}\n`));
    console.log(chalk.dim(`  Run ${chalk.cyan('vibecheck --help')} for available commands.\n`));
    return;
  }
  
  console.log('');
  console.log(vibeGradient(LOGO));
  
  // Command header
  console.log(chalk.dim('  ' + '─'.repeat(68)));
  console.log('  ' + cmd.icon + ' ' + chalk.white.bold(cmd.name.toUpperCase()) + ' ' + chalk.dim('─') + ' ' + cmd.description);
  console.log(chalk.dim('  ' + '─'.repeat(68)));
  console.log('');
  
  // Usage
  console.log(chalk.white.bold('  USAGE'));
  console.log('');
  console.log('    ' + chalk.green('$') + ' ' + cmd.usage);
  console.log('');
  
  // Options
  if (cmd.options.length > 0) {
    console.log(chalk.white.bold('  OPTIONS'));
    console.log('');
    
    for (const opt of cmd.options) {
      console.log(
        '    ' +
        chalk.yellow(opt.flag.padEnd(28)) +
        chalk.dim(opt.description) +
        (opt.default ? chalk.cyan(` [default: ${opt.default}]`) : '')
      );
    }
    
    console.log('');
  }
  
  // Global options reminder
  console.log(chalk.white.bold('  GLOBAL OPTIONS'));
  console.log('');
  console.log('    ' + chalk.dim('Also accepts: --verbose, --quiet, --json, --config <path>'));
  console.log('');
  
  // Examples
  if (cmd.examples.length > 0) {
    console.log(chalk.white.bold('  EXAMPLES'));
    console.log('');
    
    for (const example of cmd.examples) {
      console.log('    ' + chalk.green('$') + ' ' + example);
    }
    
    console.log('');
  }
  
  // Related commands
  console.log(chalk.white.bold('  SEE ALSO'));
  console.log('');
  const related = COMMANDS.filter(c => c.name !== cmd.name).slice(0, 3);
  for (const r of related) {
    console.log('    ' + r.icon + ' ' + chalk.cyan(r.name) + ' - ' + chalk.dim(r.description));
  }
  console.log('');
}

/**
 * Custom help formatter for commander
 */
export function formatHelp(): string {
  // Return empty string - we'll handle help ourselves
  return '';
}
