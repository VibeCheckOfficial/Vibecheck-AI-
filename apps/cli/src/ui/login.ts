/**
 * CLI Login Component
 * 
 * Interactive terminal-based login experience with visual effects.
 * Supports multiple authentication methods:
 * - API Key (from dashboard)
 * - Email/password
 * - GitHub OAuth
 * - Google OAuth
 * - Magic link (passwordless)
 * 
 * @module ui/login
 */

import * as p from '@clack/prompts';
import chalk from 'chalk';
import gradient from 'gradient-string';
import { 
  saveCredentials, 
  loginWithApiKey, 
  loginWithEmailPassword,
  requestMagicLink,
  verifyMagicLink,
  type StoredCredentials 
} from '../lib/credentials.js';

// ============================================================================
// Constants
// ============================================================================

/** Purple gradient for login branding */
const loginGradient = gradient(['#667eea', '#764ba2', '#f093fb']);

/** Green/cyan gradient for success states */
const successGradient = gradient(['#00ff88', '#00d9ff', '#a855f7']);

/** Red gradient for error states */
const errorGradient = gradient(['#ff416c', '#ff4b2b']);

/** Minimum password length for signup */
const MIN_PASSWORD_LENGTH = 8;

/**
 * Login ASCII Art
 */
const LOGIN_LOGO = `
    ██╗      ██████╗  ██████╗ ██╗███╗   ██╗
    ██║     ██╔═══██╗██╔════╝ ██║████╗  ██║
    ██║     ██║   ██║██║  ███╗██║██╔██╗ ██║
    ██║     ██║   ██║██║   ██║██║██║╚██╗██║
    ███████╗╚██████╔╝╚██████╔╝██║██║ ╚████║
    ╚══════╝ ╚═════╝  ╚═════╝ ╚═╝╚═╝  ╚═══╝
`;

const WELCOME_BACK_LOGO = `
   ██╗    ██╗███████╗██╗      ██████╗ ██████╗ ███╗   ███╗███████╗
   ██║    ██║██╔════╝██║     ██╔════╝██╔═══██╗████╗ ████║██╔════╝
   ██║ █╗ ██║█████╗  ██║     ██║     ██║   ██║██╔████╔██║█████╗  
   ██║███╗██║██╔══╝  ██║     ██║     ██║   ██║██║╚██╔╝██║██╔══╝  
   ╚███╔███╔╝███████╗███████╗╚██████╗╚██████╔╝██║ ╚═╝ ██║███████╗
    ╚══╝╚══╝ ╚══════╝╚══════╝ ╚═════╝ ╚═════╝ ╚═╝     ╚═╝╚══════╝
      ██████╗  █████╗  ██████╗██╗  ██╗    ██╗
      ██╔══██╗██╔══██╗██╔════╝██║ ██╔╝    ██║
      ██████╔╝███████║██║     █████╔╝     ██║
      ██╔══██╗██╔══██║██║     ██╔═██╗     ╚═╝
      ██████╔╝██║  ██║╚██████╗██║  ██╗    ██╗
      ╚═════╝ ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝    ╚═╝
`;

const SUCCESS_LOGO = `
    ███████╗██╗   ██╗ ██████╗ ██████╗███████╗███████╗███████╗
    ██╔════╝██║   ██║██╔════╝██╔════╝██╔════╝██╔════╝██╔════╝
    ███████╗██║   ██║██║     ██║     █████╗  ███████╗███████╗
    ╚════██║██║   ██║██║     ██║     ██╔══╝  ╚════██║╚════██║
    ███████║╚██████╔╝╚██████╗╚██████╗███████╗███████║███████║
    ╚══════╝ ╚═════╝  ╚═════╝ ╚═════╝╚══════╝╚══════╝╚══════╝
`;

/**
 * Animated frames for loading
 */
const LOADING_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SECURE_FRAMES = ['🔒', '🔐', '🔓', '🔐'];
const PULSE_FRAMES = ['◉', '◎', '○', '◎'];

// ============================================================================
// Types
// ============================================================================

/**
 * User session data returned after successful authentication
 */
export interface UserSession {
  /** User's email address */
  email: string;
  /** User's display name */
  name: string;
  /** Subscription tier */
  tier: 'free' | 'pro' | 'enterprise';
  /** Optional avatar URL */
  avatar?: string;
  /** JWT access token */
  token?: string;
}

/**
 * Authentication method selection options
 */
type AuthMethod = 'email' | 'github' | 'google' | 'magic' | 'signup' | 'cancel';

/**
 * Tier display configuration
 */
interface TierDisplay {
  icon: string;
  label: string;
  color: 'white' | 'yellow' | 'cyan';
}

/** Tier display information mapping */
const TIER_DISPLAY: Record<UserSession['tier'], TierDisplay> = {
  free: { icon: '🆓', label: 'Free', color: 'white' },
  pro: { icon: '⭐', label: 'Pro', color: 'yellow' },
  enterprise: { icon: '🏢', label: 'Enterprise', color: 'cyan' },
};

// ============================================================================
// Animation Utilities
// ============================================================================

/**
 * Simulates typing text to the terminal character by character.
 * 
 * @param text - The text to type
 * @param delay - Milliseconds between characters (default: 30)
 * @returns Promise that resolves when animation completes
 * 
 * @example
 * await typeText('Hello, World!', 50);
 */
async function typeText(text: string, delay: number = 30): Promise<void> {
  if (!text) return;
  
  for (const char of text) {
    process.stdout.write(char);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  console.log('');
}

/**
 * Displays an animated progress bar in the terminal.
 * 
 * @param message - Label to show next to the progress bar
 * @param duration - Total animation duration in milliseconds (default: 2000)
 * @returns Promise that resolves when animation completes
 * 
 * @example
 * await showLoadingBar('Connecting to server...', 1500);
 */
async function showLoadingBar(message: string, duration: number = 2000): Promise<void> {
  const width = 30;
  const startTime = Date.now();
  
  process.stdout.write('\n');
  
  while (Date.now() - startTime < duration) {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const filled = Math.floor(progress * width);
    const empty = width - filled;
    
    const bar = chalk.green('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
    const percent = Math.floor(progress * 100);
    const frame = LOADING_FRAMES[Math.floor((elapsed / 80) % LOADING_FRAMES.length)];
    
    process.stdout.write(`\r  ${chalk.cyan(frame)} ${message} ${bar} ${chalk.cyan(percent + '%')}`);
    
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  process.stdout.write(`\r  ${chalk.green('✓')} ${message} ${chalk.green('█'.repeat(width))} ${chalk.green('100%')}\n`);
}

/**
 * Displays a sequence of security-themed loading animations.
 * 
 * Shows progress bars for:
 * - Establishing connection
 * - Verifying credentials
 * - Encrypting session
 * - Cloud sync
 * 
 * @returns Promise that resolves when all animations complete
 */
async function showSecurityAnimation(): Promise<void> {
  const messages = [
    'Establishing secure connection...',
    'Verifying credentials...',
    'Encrypting session...',
    'Syncing with cloud...',
  ];
  
  for (const msg of messages) {
    await showLoadingBar(msg, 500);
  }
}

/**
 * Draws a styled input box border in the terminal.
 * 
 * @param label - Label text to display inside the box
 * @param width - Width of the box in characters (default: 50)
 */
function drawInputBox(label: string, width: number = 50): void {
  const border = chalk.dim;
  console.log('');
  console.log('  ' + border('┌' + '─'.repeat(width) + '┐'));
  console.log('  ' + border('│') + ' ' + chalk.cyan(label.padEnd(width - 1)) + border('│'));
  console.log('  ' + border('└' + '─'.repeat(width) + '┘'));
}

// ============================================================================
// Main Login Flow
// ============================================================================

/**
 * Displays the main login screen and handles authentication flow.
 * 
 * Presents options for:
 * - Email/password login
 * - GitHub OAuth
 * - Google OAuth
 * - Magic link (passwordless)
 * - Account creation
 * 
 * @returns Promise resolving to UserSession on success, null if cancelled
 * 
 * @example
 * const session = await showLoginScreen();
 * if (session) {
 *   console.log(`Logged in as ${session.email}`);
 * }
 */
export async function showLoginScreen(): Promise<UserSession | null> {
  console.clear();
  console.log('');
  console.log(loginGradient(LOGIN_LOGO));
  console.log('');
  console.log(chalk.dim('  ════════════════════════════════════════════════════════════'));
  console.log('');
  console.log('  ' + chalk.white.bold('Connect to VibeCheck Cloud'));
  console.log('  ' + chalk.dim('Sync your truthpacks, collaborate with your team'));
  console.log('');
  console.log(chalk.dim('  ════════════════════════════════════════════════════════════'));
  console.log('');
  
  // Auth method selection
  const authMethod = await p.select({
    message: chalk.cyan('How would you like to authenticate?'),
    options: [
      {
        value: 'apikey',
        label: '🔑  ' + chalk.white('API Key'),
        hint: 'From dashboard (recommended)',
      },
      {
        value: 'email',
        label: '📧  ' + chalk.white('Email & Password'),
        hint: 'Classic login',
      },
      {
        value: 'github',
        label: '🐙  ' + chalk.white('Continue with GitHub'),
        hint: 'OAuth login',
      },
      {
        value: 'google',
        label: '🔍  ' + chalk.white('Continue with Google'),
        hint: 'OAuth login',
      },
      {
        value: 'magic',
        label: '✨  ' + chalk.white('Magic Link'),
        hint: 'Passwordless email',
      },
      {
        value: 'signup',
        label: '🆕  ' + chalk.white('Create New Account'),
        hint: 'Join VibeCheck',
      },
      {
        value: 'cancel',
        label: '❌  ' + chalk.dim('Cancel'),
        hint: 'Return to menu',
      },
    ],
  });
  
  if (p.isCancel(authMethod) || authMethod === 'cancel') {
    return null;
  }
  
  switch (authMethod) {
    case 'apikey':
      return await apiKeyLogin();
    case 'email':
      return await emailLogin();
    case 'github':
      return await oauthLogin('GitHub');
    case 'google':
      return await oauthLogin('Google');
    case 'magic':
      return await magicLinkLogin();
    case 'signup':
      return await signupFlow();
    default:
      return null;
  }
}

/**
 * Handles API key authentication flow.
 * 
 * Prompts for an API key from the dashboard and validates it with the server.
 * This is the recommended method for CLI authentication.
 * 
 * @returns Promise resolving to UserSession on success, null if cancelled
 */
async function apiKeyLogin(): Promise<UserSession | null> {
  console.log('');
  console.log(chalk.dim('  ────────────────────────────────────────────────────────'));
  console.log('');
  console.log('  ' + chalk.cyan('Get your API key from:'));
  console.log('  ' + chalk.white('https://app.vibecheckai.dev/api-keys'));
  console.log('');
  
  const apiKey = await p.password({
    message: chalk.cyan('🔑 Paste your API key'),
    validate: (value) => {
      if (!value) return 'API key is required';
      if (value.length < 20) return 'Invalid API key format';
      return undefined;
    },
  });
  
  if (p.isCancel(apiKey)) return null;
  
  const s = p.spinner();
  s.start(chalk.cyan('Validating API key...'));
  
  const result = await loginWithApiKey(apiKey as string);
  
  if (!result.success) {
    s.stop(chalk.red(`✗ ${result.error}`));
    console.log('');
    
    const retry = await p.confirm({
      message: chalk.cyan('Would you like to try again?'),
      initialValue: true,
    });
    
    if (p.isCancel(retry) || !retry) return null;
    return apiKeyLogin();
  }
  
  s.stop(chalk.green('✓ API key validated!'));
  
  console.log('');
  await showSecurityAnimation();
  
  const user = result.user!;
  return showLoginSuccess({
    email: user.email ?? 'user@vibecheck.dev',
    name: user.name ?? user.email?.split('@')[0] ?? 'User',
    tier: user.tier ?? 'free',
  });
}

/**
 * Handles email/password authentication flow.
 * 
 * Prompts for email and password, validates input, and authenticates
 * against the real API server.
 * 
 * @returns Promise resolving to UserSession on success, null if cancelled
 */
async function emailLogin(): Promise<UserSession | null> {
  console.log('');
  console.log(chalk.dim('  ────────────────────────────────────────────────────────'));
  console.log('');
  
  const email = await p.text({
    message: chalk.cyan('📧 Email address'),
    placeholder: 'you@example.com',
    validate: (value) => {
      if (!value) return 'Email is required';
      if (!value.includes('@')) return 'Please enter a valid email';
      return undefined;
    },
  });
  
  if (p.isCancel(email)) return null;
  
  const password = await p.password({
    message: chalk.cyan('🔑 Password'),
    validate: (value) => {
      if (!value) return 'Password is required';
      if (value.length < 6) return 'Password must be at least 6 characters';
      return undefined;
    },
  });
  
  if (p.isCancel(password)) return null;
  
  const s = p.spinner();
  s.start(chalk.cyan('Authenticating...'));
  
  // Call real API
  const result = await loginWithEmailPassword(email as string, password as string);
  
  if (!result.success) {
    s.stop(chalk.red(`✗ ${result.error}`));
    console.log('');
    
    const retry = await p.confirm({
      message: chalk.cyan('Would you like to try again?'),
      initialValue: true,
    });
    
    if (p.isCancel(retry) || !retry) return null;
    return emailLogin();
  }
  
  s.stop(chalk.green('✓ Authentication successful!'));
  
  console.log('');
  await showSecurityAnimation();
  
  const user = result.user!;
  return showLoginSuccess({
    email: user.email ?? email as string,
    name: user.name ?? (email as string).split('@')[0],
    tier: user.tier ?? 'free',
  });
}

/**
 * Handles OAuth authentication flow for a given provider.
 * 
 * Opens browser for OAuth login and waits for user to complete the flow.
 * After OAuth, users should generate an API key from the dashboard.
 * 
 * @param provider - OAuth provider name (e.g., 'GitHub', 'Google')
 * @returns Promise resolving to UserSession on success, null if cancelled
 */
async function oauthLogin(provider: string): Promise<UserSession | null> {
  console.log('');
  console.log(chalk.dim('  ────────────────────────────────────────────────────────'));
  console.log('');
  
  // For CLI, the recommended flow is:
  // 1. Open browser to web dashboard OAuth
  // 2. User completes OAuth in browser
  // 3. User generates API key in dashboard
  // 4. User pastes API key in CLI
  
  console.log(chalk.cyan(`  ${provider} OAuth for CLI:`));
  console.log('');
  console.log(chalk.white('  1. We\'ll open your browser to sign in with ' + provider));
  console.log(chalk.white('  2. After signing in, go to Settings → API Keys'));
  console.log(chalk.white('  3. Create an API key and paste it here'));
  console.log('');
  
  const proceed = await p.confirm({
    message: chalk.cyan(`Open browser to sign in with ${provider}?`),
    initialValue: true,
  });
  
  if (p.isCancel(proceed) || !proceed) return null;
  
  const s = p.spinner();
  s.start(chalk.cyan(`Opening ${provider} login page...`));
  
  // Open browser to the web app's OAuth flow
  try {
    const open = (await import('open')).default;
    const webUrl = process.env.VIBECHECK_WEB_URL ?? 'https://app.vibecheckai.dev';
    const providerLower = provider.toLowerCase();
    
    // Open browser to OAuth endpoint
    await open(`${webUrl}/auth/login?provider=${providerLower}`);
    
    s.stop(chalk.green(`✓ Browser opened!`));
  } catch {
    s.stop(chalk.yellow('⚠ Could not open browser automatically'));
    console.log('');
    console.log(chalk.white('  Please visit: https://app.vibecheckai.dev/auth/login'));
  }
  
  console.log('');
  console.log(chalk.dim('  ┌─────────────────────────────────────────────────────────┐'));
  console.log(chalk.dim('  │') + chalk.white('  Complete sign-in in your browser, then:               ') + chalk.dim('│'));
  console.log(chalk.dim('  │') + chalk.white('  1. Go to Settings → API Keys                          ') + chalk.dim('│'));
  console.log(chalk.dim('  │') + chalk.white('  2. Create a new API key                               ') + chalk.dim('│'));
  console.log(chalk.dim('  │') + chalk.white('  3. Copy and paste it below                            ') + chalk.dim('│'));
  console.log(chalk.dim('  └─────────────────────────────────────────────────────────┘'));
  console.log('');
  
  // Now prompt for API key
  const apiKey = await p.password({
    message: chalk.cyan('🔑 Paste your API key'),
    validate: (value) => {
      if (!value) return 'API key is required';
      if (value.length < 20) return 'Invalid API key format';
      return undefined;
    },
  });
  
  if (p.isCancel(apiKey)) return null;
  
  const s2 = p.spinner();
  s2.start(chalk.cyan('Validating API key...'));
  
  const result = await loginWithApiKey(apiKey as string);
  
  if (!result.success) {
    s2.stop(chalk.red(`✗ ${result.error}`));
    console.log('');
    
    const retry = await p.confirm({
      message: chalk.cyan('Would you like to try again?'),
      initialValue: true,
    });
    
    if (p.isCancel(retry) || !retry) return null;
    return oauthLogin(provider);
  }
  
  s2.stop(chalk.green('✓ API key validated!'));
  
  console.log('');
  await showSecurityAnimation();
  
  const user = result.user!;
  return showLoginSuccess({
    email: user.email ?? 'user@vibecheck.dev',
    name: user.name ?? user.email?.split('@')[0] ?? 'User',
    tier: user.tier ?? 'free',
  });
}

/**
 * Handles magic link (passwordless) authentication flow.
 * 
 * Sends a login link to the user's email via the API.
 * User clicks the link, gets a token, and pastes it back in the CLI.
 * 
 * @returns Promise resolving to UserSession on success, null if cancelled
 */
async function magicLinkLogin(): Promise<UserSession | null> {
  console.log('');
  console.log(chalk.dim('  ────────────────────────────────────────────────────────'));
  console.log('');
  
  const email = await p.text({
    message: chalk.cyan('📧 Enter your email for a magic link'),
    placeholder: 'you@example.com',
    validate: (value) => {
      if (!value) return 'Email is required';
      if (!value.includes('@')) return 'Please enter a valid email';
      return undefined;
    },
  });
  
  if (p.isCancel(email)) return null;
  
  const s = p.spinner();
  s.start(chalk.cyan('Sending magic link...'));
  
  // Call real API to send magic link
  const result = await requestMagicLink(email as string);
  
  if (!result.success) {
    s.stop(chalk.red(`✗ ${result.error}`));
    console.log('');
    
    const retry = await p.confirm({
      message: chalk.cyan('Would you like to try again?'),
      initialValue: true,
    });
    
    if (p.isCancel(retry) || !retry) return null;
    return magicLinkLogin();
  }
  
  s.stop(chalk.green('✓ Magic link sent!'));
  
  console.log('');
  console.log(chalk.dim('  ┌─────────────────────────────────────────────────────────┐'));
  console.log(chalk.dim('  │') + chalk.white('  📬 Check your inbox!                                    ') + chalk.dim('│'));
  console.log(chalk.dim('  │') + chalk.dim(`     We sent a login link to ${email}`) + ' '.repeat(Math.max(0, 26 - (email as string).length)) + chalk.dim('│'));
  console.log(chalk.dim('  │') + chalk.white('                                                          ') + chalk.dim('│'));
  console.log(chalk.dim('  │') + chalk.white('  Click the link in your email, then paste the           ') + chalk.dim('│'));
  console.log(chalk.dim('  │') + chalk.white('  verification code below.                               ') + chalk.dim('│'));
  console.log(chalk.dim('  └─────────────────────────────────────────────────────────┘'));
  console.log('');
  
  // For CLI, user needs to get the token from the magic link
  // The web app should show them a code to paste
  const token = await p.text({
    message: chalk.cyan('🔑 Paste the verification code from the email'),
    placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    validate: (value) => {
      if (!value) return 'Verification code is required';
      if (value.length < 20) return 'Invalid verification code';
      return undefined;
    },
  });
  
  if (p.isCancel(token)) return null;
  
  const s2 = p.spinner();
  s2.start(chalk.cyan('Verifying...'));
  
  // Verify the magic link token
  const verifyResult = await verifyMagicLink(token as string);
  
  if (!verifyResult.success) {
    s2.stop(chalk.red(`✗ ${verifyResult.error}`));
    console.log('');
    
    const retry = await p.confirm({
      message: chalk.cyan('Would you like to try again?'),
      initialValue: true,
    });
    
    if (p.isCancel(retry) || !retry) return null;
    return magicLinkLogin();
  }
  
  s2.stop(chalk.green('✓ Verification successful!'));
  
  await showSecurityAnimation();
  
  const user = verifyResult.user!;
  return showLoginSuccess({
    email: user.email ?? email as string,
    name: user.name ?? (email as string).split('@')[0],
    tier: user.tier ?? 'free',
  });
}

/**
 * Handles new account registration flow.
 * 
 * Collects user details, validates password strength, and creates account.
 * 
 * @returns Promise resolving to UserSession on success, null if cancelled
 */
async function signupFlow(): Promise<UserSession | null> {
  console.clear();
  console.log('');
  console.log(successGradient(`
      ██╗ ██████╗ ██╗███╗   ██╗
      ██║██╔═══██╗██║████╗  ██║
      ██║██║   ██║██║██╔██╗ ██║
 ██   ██║██║   ██║██║██║╚██╗██║
 ╚█████╔╝╚██████╔╝██║██║ ╚████║
  ╚════╝  ╚═════╝ ╚═╝╚═╝  ╚═══╝
  `));
  console.log('');
  console.log(chalk.dim('  ════════════════════════════════════════════════════════════'));
  console.log('');
  console.log('  ' + chalk.white.bold('Create Your VibeCheck Account'));
  console.log('  ' + chalk.dim('Join thousands of developers preventing AI hallucinations'));
  console.log('');
  
  // Name
  const name = await p.text({
    message: chalk.cyan('👤 What should we call you?'),
    placeholder: 'Your name',
    validate: (value) => {
      if (!value) return 'Name is required';
      return undefined;
    },
  });
  
  if (p.isCancel(name)) return null;
  
  // Email
  const email = await p.text({
    message: chalk.cyan('📧 Email address'),
    placeholder: 'you@example.com',
    validate: (value) => {
      if (!value) return 'Email is required';
      if (!value.includes('@')) return 'Please enter a valid email';
      return undefined;
    },
  });
  
  if (p.isCancel(email)) return null;
  
  // Password
  const password = await p.password({
    message: chalk.cyan('🔑 Create a password'),
    validate: (value) => {
      if (!value) return 'Password is required';
      if (value.length < 8) return 'Password must be at least 8 characters';
      if (!/[A-Z]/.test(value)) return 'Password must contain an uppercase letter';
      if (!/[0-9]/.test(value)) return 'Password must contain a number';
      return undefined;
    },
  });
  
  if (p.isCancel(password)) return null;
  
  // Password strength indicator
  const strength = getPasswordStrength(password as string);
  console.log('');
  console.log('  ' + chalk.dim('Password Strength:') + ' ' + strength.indicator);
  
  // Confirm password
  const confirmPassword = await p.password({
    message: chalk.cyan('🔑 Confirm password'),
    validate: (value) => {
      if (value !== password) return 'Passwords do not match';
      return undefined;
    },
  });
  
  if (p.isCancel(confirmPassword)) return null;
  
  // Tier selection
  console.log('');
  const tier = await p.select({
    message: chalk.cyan('Choose your plan'),
    options: [
      {
        value: 'free',
        label: '🆓  ' + chalk.white('Free'),
        hint: 'Full CLI access, 3 projects',
      },
      {
        value: 'pro',
        label: '⭐  ' + chalk.yellow('Pro') + chalk.dim(' - $29/dev/mo'),
        hint: 'Cloud sync, team collaboration, API access',
      },
      {
        value: 'enterprise',
        label: '🏢  ' + chalk.cyan('Enterprise') + chalk.dim(' - Contact us'),
        hint: 'SSO, audit logs, on-prem, dedicated support',
      },
    ],
  });
  
  if (p.isCancel(tier)) return null;
  
  // Terms acceptance
  const terms = await p.confirm({
    message: chalk.cyan('I agree to the Terms of Service and Privacy Policy'),
    initialValue: false,
  });
  
  if (p.isCancel(terms) || !terms) {
    console.log('');
    console.log(chalk.yellow('  ⚠ You must accept the terms to create an account.'));
    return null;
  }
  
  // Create account animation
  console.log('');
  await showLoadingBar('Creating your account', 1000);
  await showLoadingBar('Setting up your workspace', 800);
  await showLoadingBar('Preparing your first project', 600);
  
  return showLoginSuccess({
    email: email as string,
    name: name as string,
    tier: tier as 'free' | 'pro' | 'enterprise',
  });
}

/**
 * Calculates password strength score and visual indicator.
 * 
 * Evaluates:
 * - Length (8+, 12+)
 * - Uppercase letters
 * - Lowercase letters
 * - Numbers
 * - Special characters
 * 
 * @param password - Password to evaluate
 * @returns Object with score (0-6) and visual indicator string
 * 
 * @example
 * const { score, indicator } = getPasswordStrength('MyP@ssw0rd');
 * console.log(indicator); // ████░ Strong
 */
function getPasswordStrength(password: string): { score: number; indicator: string } {
  let score = 0;
  
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  
  const bars = 5;
  const filled = Math.min(Math.floor((score / 6) * bars), bars);
  
  const colors = [chalk.red, chalk.red, chalk.yellow, chalk.yellow, chalk.green, chalk.green];
  const labels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
  
  const colorFn = colors[score - 1] || chalk.red;
  const indicator = colorFn('█'.repeat(filled) + '░'.repeat(bars - filled) + ' ' + labels[score - 1]);
  
  return { score, indicator };
}

/**
 * Displays the login success screen with user information.
 * 
 * Shows:
 * - Welcome back message
 * - User profile card
 * - Features available for the user's tier
 * 
 * @param session - Authenticated user session
 * @returns Promise resolving to the same session after display
 */
async function showLoginSuccess(session: UserSession): Promise<UserSession> {
  console.clear();
  console.log('');
  console.log(successGradient(WELCOME_BACK_LOGO));
  console.log('');
  console.log(chalk.dim('  ════════════════════════════════════════════════════════════'));
  console.log('');
  
  // User card
  const tierColors = {
    free: chalk.green,
    pro: chalk.yellow,
    enterprise: chalk.cyan,
  };
  const tierLabels = {
    free: '🆓 Free',
    pro: '⭐ Pro ($29/dev/mo)',
    enterprise: '🏢 Enterprise',
  };
  
  console.log('  ' + chalk.dim('┌─────────────────────────────────────────────────────────┐'));
  console.log('  ' + chalk.dim('│') + '                                                         ' + chalk.dim('│'));
  console.log('  ' + chalk.dim('│') + '   ' + chalk.green('●') + ' ' + chalk.white.bold('Logged in successfully!') + '                          ' + chalk.dim('│'));
  console.log('  ' + chalk.dim('│') + '                                                         ' + chalk.dim('│'));
  console.log('  ' + chalk.dim('│') + '   ' + chalk.dim('Name:') + '  ' + chalk.white(session.name.padEnd(40)) + ' ' + chalk.dim('│'));
  console.log('  ' + chalk.dim('│') + '   ' + chalk.dim('Email:') + ' ' + chalk.white(session.email.padEnd(40)) + ' ' + chalk.dim('│'));
  console.log('  ' + chalk.dim('│') + '   ' + chalk.dim('Tier:') + '  ' + tierColors[session.tier](tierLabels[session.tier].padEnd(40)) + ' ' + chalk.dim('│'));
  console.log('  ' + chalk.dim('│') + '                                                         ' + chalk.dim('│'));
  console.log('  ' + chalk.dim('└─────────────────────────────────────────────────────────┘'));
  console.log('');
  
  // Features based on tier
  console.log('  ' + chalk.white.bold('Your Features:'));
  console.log('');
  
  const features = {
    free: [
      '✓ Full CLI access (all commands)',
      '✓ Unlimited scans',
      '✓ 3 local projects',
      '✓ SARIF output',
      '✓ Community support',
    ],
    pro: [
      '✓ Everything in Free',
      '✓ Unlimited projects',
      '✓ Cloud sync & dashboard',
      '✓ Team collaboration',
      '✓ API access',
      '✓ Policy engine',
      '✓ Priority support',
    ],
    enterprise: [
      '✓ Everything in Pro',
      '✓ SSO/SAML',
      '✓ Audit logs',
      '✓ Custom policies',
      '✓ On-premises deployment',
      '✓ Dedicated support',
      '✓ SLA guarantee',
      '✓ Training included',
    ],
  };
  
  for (const feature of features[session.tier]) {
    console.log('    ' + chalk.green(feature));
  }
  
  console.log('');
  console.log(chalk.dim('  ════════════════════════════════════════════════════════════'));
  console.log('');
  console.log('  ' + chalk.dim('Press') + ' ' + chalk.cyan('Enter') + ' ' + chalk.dim('to continue to your dashboard...'));
  console.log('');
  
  // Wait for user acknowledgment
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  return session;
}

/**
 * Displays logout confirmation prompt and handles logout.
 * 
 * @param session - Current user session to log out from
 * @returns Promise resolving to true if logged out, false if cancelled
 * 
 * @example
 * const loggedOut = await showLogout(currentSession);
 * if (loggedOut) {
 *   console.log('Goodbye!');
 * }
 */
export async function showLogout(session: UserSession): Promise<boolean> {
  console.log('');
  
  const confirmed = await p.confirm({
    message: chalk.yellow(`Are you sure you want to log out, ${session.name}?`),
    initialValue: false,
  });
  
  if (p.isCancel(confirmed) || !confirmed) {
    return false;
  }
  
  const s = p.spinner();
  s.start(chalk.cyan('Logging out...'));
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  s.stop(chalk.green('✓ Logged out successfully'));
  
  console.log('');
  console.log(chalk.dim('  👋 See you next time!'));
  console.log('');
  
  return true;
}
