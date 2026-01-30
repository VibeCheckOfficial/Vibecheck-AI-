/**
 * Interactive Menu for VibeCoders
 * 
 * A beautiful, animated interactive menu for the VibeCheck CLI
 */

import * as p from '@clack/prompts';
import chalk from 'chalk';
import gradient from 'gradient-string';

// Custom gradients
const vibeGradient = gradient(['#00d9ff', '#00ff88']);
const titleGradient = gradient(['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3']);

/**
 * Animated ASCII art for the menu
 */
const MENU_LOGO = `
    ██╗   ██╗██╗██████╗ ███████╗ ██████╗ ██████╗ ██████╗ ███████╗██████╗ 
    ██║   ██║██║██╔══██╗██╔════╝██╔════╝██╔═══██╗██╔══██╗██╔════╝██╔══██╗
    ██║   ██║██║██████╔╝█████╗  ██║     ██║   ██║██║  ██║█████╗  ██████╔╝
    ╚██╗ ██╔╝██║██╔══██╗██╔══╝  ██║     ██║   ██║██║  ██║██╔══╝  ██╔══██╗
     ╚████╔╝ ██║██████╔╝███████╗╚██████╗╚██████╔╝██████╔╝███████╗██║  ██║
      ╚═══╝  ╚═╝╚═════╝ ╚══════╝ ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝
`;

/**
 * Menu item interface
 */
interface MenuItem {
  value: string;
  label: string;
  hint: string;
  icon: string;
  action?: () => Promise<void>;
}

/**
 * Main menu items
 */
const MAIN_MENU_ITEMS: MenuItem[] = [
  {
    value: 'scan',
    label: 'Scan Codebase',
    hint: 'Generate truthpack from your code',
    icon: '🔍',
  },
  {
    value: 'check',
    label: 'Check for Hallucinations',
    hint: 'Detect AI-generated inconsistencies',
    icon: '🛡️',
  },
  {
    value: 'validate',
    label: 'Validate Files',
    hint: 'Validate against truthpack',
    icon: '✅',
  },
  {
    value: 'fix',
    label: 'Auto-Fix Issues',
    hint: 'Apply AI-powered fixes',
    icon: '🔧',
  },
  {
    value: 'ship',
    label: 'Ship Check',
    hint: 'Pre-deployment verification',
    icon: '🚢',
  },
  {
    value: 'report',
    label: 'Generate Report',
    hint: 'Create HTML/PDF reports',
    icon: '📊',
  },
  {
    value: 'watch',
    label: 'Watch Mode',
    hint: 'Continuous validation',
    icon: '👁️',
  },
  {
    value: 'divider1',
    label: '─'.repeat(40),
    hint: '',
    icon: '',
  },
  {
    value: 'init',
    label: 'Initialize Project',
    hint: 'Set up VibeCheck configuration',
    icon: '🚀',
  },
  {
    value: 'config',
    label: 'Configuration',
    hint: 'View or edit settings',
    icon: '⚙️',
  },
  {
    value: 'doctor',
    label: 'System Doctor',
    hint: 'Check system health',
    icon: '🩺',
  },
  {
    value: 'divider2',
    label: '─'.repeat(40),
    hint: '',
    icon: '',
  },
  {
    value: 'login',
    label: 'Login / Signup',
    hint: 'Connect to VibeCheck Cloud',
    icon: '🔐',
  },
  {
    value: 'help',
    label: 'Help & Documentation',
    hint: 'View commands and docs',
    icon: '📚',
  },
  {
    value: 'exit',
    label: 'Exit',
    hint: 'Close VibeCheck',
    icon: '👋',
  },
];

/**
 * Print animated welcome message
 */
async function printWelcome(): Promise<void> {
  console.clear();
  console.log('');
  console.log(titleGradient(MENU_LOGO));
  console.log('');
  console.log(chalk.dim('  ═══════════════════════════════════════════════════════════════════════'));
  console.log('');
  console.log('  ' + chalk.white.bold('Welcome, Vibecoder!') + ' ' + chalk.dim('Let\'s build something amazing together.'));
  console.log('');
  console.log('  ' + chalk.dim('Today\'s Vibe:') + ' ' + getVibeOfTheDay());
  console.log('  ' + chalk.dim('Status:') + ' ' + getStatusIndicator());
  console.log('');
  console.log(chalk.dim('  ═══════════════════════════════════════════════════════════════════════'));
  console.log('');
}

/**
 * Get a random vibe of the day
 */
function getVibeOfTheDay(): string {
  const vibes = [
    chalk.green('✨ Flow state activated'),
    chalk.cyan('🌊 Riding the code wave'),
    chalk.magenta('💫 Creative energy high'),
    chalk.yellow('⚡ Lightning fast today'),
    chalk.blue('🧘 Zen coding mode'),
    chalk.red('🔥 On fire!'),
    chalk.green('🌱 Growing stronger'),
    chalk.cyan('🎯 Laser focused'),
  ];
  return vibes[Math.floor(Math.random() * vibes.length)];
}

/**
 * Get project status indicator
 */
function getStatusIndicator(): string {
  // In a real implementation, this would check actual project state
  const statuses = [
    chalk.green('● Project initialized'),
    chalk.yellow('◐ Truthpack needs refresh'),
    chalk.red('○ Not initialized'),
  ];
  // Default to initialized for demo
  return statuses[0];
}

/**
 * Format menu option for display
 */
function formatMenuOption(item: MenuItem): { value: string; label: string; hint?: string } {
  if (item.value.startsWith('divider')) {
    return {
      value: item.value,
      label: chalk.dim(item.label),
    };
  }
  
  return {
    value: item.value,
    label: `${item.icon}  ${item.label}`,
    hint: item.hint,
  };
}

/**
 * Show the main interactive menu
 */
export async function showInteractiveMenu(): Promise<string | null> {
  await printWelcome();
  
  const selection = await p.select({
    message: chalk.cyan.bold('What would you like to do?'),
    options: MAIN_MENU_ITEMS
      .filter(item => !item.value.startsWith('divider'))
      .map(item => ({
        value: item.value,
        label: `${item.icon}  ${chalk.white(item.label)}`,
        hint: chalk.dim(item.hint),
      })),
  });
  
  if (p.isCancel(selection)) {
    console.log('');
    console.log(chalk.dim('  👋 See you next time, Vibecoder!'));
    console.log('');
    return null;
  }
  
  return selection as string;
}

/**
 * Show submenu for a category
 */
export async function showSubmenu(category: string): Promise<string | null> {
  const submenus: Record<string, MenuItem[]> = {
    scan: [
      { value: 'scan-full', label: 'Full Scan', hint: 'Complete codebase analysis', icon: '🔄' },
      { value: 'scan-incremental', label: 'Incremental Scan', hint: 'Only changed files', icon: '⚡' },
      { value: 'scan-routes', label: 'Routes Only', hint: 'Scan API routes', icon: '🛣️' },
      { value: 'scan-env', label: 'Environment Only', hint: 'Scan env variables', icon: '🔐' },
      { value: 'back', label: 'Back to Main Menu', hint: '', icon: '◀️' },
    ],
    check: [
      { value: 'check-full', label: 'Full Check', hint: 'Complete hallucination detection', icon: '🛡️' },
      { value: 'check-strict', label: 'Strict Mode', hint: 'Maximum scrutiny', icon: '🔒' },
      { value: 'check-fast', label: 'Quick Check', hint: 'Fast essential checks', icon: '⚡' },
      { value: 'back', label: 'Back to Main Menu', hint: '', icon: '◀️' },
    ],
  };
  
  const items = submenus[category];
  if (!items) return category; // No submenu, return original
  
  console.log('');
  
  const selection = await p.select({
    message: chalk.cyan.bold(`${category.toUpperCase()} Options`),
    options: items.map(item => ({
      value: item.value,
      label: `${item.icon}  ${chalk.white(item.label)}`,
      hint: item.hint ? chalk.dim(item.hint) : undefined,
    })),
  });
  
  if (p.isCancel(selection) || selection === 'back') {
    return null;
  }
  
  return selection as string;
}

/**
 * Show a styled confirmation dialog
 */
export async function showConfirmation(
  message: string,
  defaultValue: boolean = false
): Promise<boolean> {
  console.log('');
  
  const confirmed = await p.confirm({
    message: chalk.yellow(message),
    initialValue: defaultValue,
  });
  
  if (p.isCancel(confirmed)) {
    return false;
  }
  
  return confirmed as boolean;
}

/**
 * Show a styled text input
 */
export async function showInput(
  message: string,
  placeholder?: string,
  defaultValue?: string
): Promise<string | null> {
  console.log('');
  
  const input = await p.text({
    message: chalk.cyan(message),
    placeholder,
    defaultValue,
  });
  
  if (p.isCancel(input)) {
    return null;
  }
  
  return input as string;
}

/**
 * Show a multi-select menu
 */
export async function showMultiSelect(
  message: string,
  options: Array<{ value: string; label: string; hint?: string }>
): Promise<string[] | null> {
  console.log('');
  
  const selected = await p.multiselect({
    message: chalk.cyan(message),
    options: options.map(opt => ({
      value: opt.value,
      label: chalk.white(opt.label),
      hint: opt.hint ? chalk.dim(opt.hint) : undefined,
    })),
    required: false,
  });
  
  if (p.isCancel(selected)) {
    return null;
  }
  
  return selected as string[];
}

/**
 * Show a spinner with message
 */
export function showSpinner(message: string): { 
  stop: (finalMessage?: string) => void;
  update: (newMessage: string) => void;
} {
  const s = p.spinner();
  s.start(chalk.cyan(message));
  
  return {
    stop: (finalMessage?: string) => {
      s.stop(finalMessage ? chalk.green(finalMessage) : undefined);
    },
    update: (newMessage: string) => {
      s.message(chalk.cyan(newMessage));
    },
  };
}

/**
 * Show a task list with progress
 */
export async function showTaskList(
  tasks: Array<{
    title: string;
    task: () => Promise<void>;
  }>
): Promise<void> {
  console.log('');
  
  const taskGroup = p.group({}, {
    onCancel: () => {
      p.cancel('Operation cancelled.');
      process.exit(0);
    },
  });
  
  for (const task of tasks) {
    const s = p.spinner();
    s.start(chalk.cyan(task.title));
    
    try {
      await task.task();
      s.stop(chalk.green(`✓ ${task.title}`));
    } catch (error) {
      s.stop(chalk.red(`✗ ${task.title}`));
      throw error;
    }
  }
}

/**
 * Print a styled success message
 */
export function printSuccess(message: string): void {
  console.log('');
  console.log(chalk.green.bold('  ✓ ') + chalk.white(message));
  console.log('');
}

/**
 * Print a styled error message
 */
export function printError(message: string): void {
  console.log('');
  console.log(chalk.red.bold('  ✗ ') + chalk.white(message));
  console.log('');
}

/**
 * Print a styled warning message
 */
export function printWarning(message: string): void {
  console.log('');
  console.log(chalk.yellow.bold('  ⚠ ') + chalk.white(message));
  console.log('');
}

/**
 * Print a styled info message
 */
export function printInfo(message: string): void {
  console.log('');
  console.log(chalk.blue.bold('  ℹ ') + chalk.white(message));
  console.log('');
}
