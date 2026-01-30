/**
 * CLI Registry Type Definitions
 */

// ============================================================================
// Command Types
// ============================================================================

export interface CommandDefinition {
  /** Unique command name */
  name: string;
  /** Short description (one line) */
  description: string;
  /** Long description for help */
  longDescription?: string;
  /** Access tier required */
  tier: Tier;
  /** Command category for grouping */
  category: CommandCategory;
  /** Example usages */
  examples: CommandExample[];
  /** Related commands */
  related: string[];
  /** Command aliases */
  aliases?: string[];
  /** Skip auth check for this command */
  skipAuth?: boolean;
  /** Command handler function */
  handler?: CommandHandler;
  /** Module path for lazy loading */
  module?: string;
  /** Command flags/options */
  flags?: CommandFlag[];
  /** Positional arguments */
  args?: CommandArg[];
  /** Whether command is hidden from help */
  hidden?: boolean;
  /** Deprecation notice */
  deprecated?: string;
}

export interface CommandExample {
  /** Command string */
  command: string;
  /** Description of what this example does */
  description: string;
}

export interface CommandFlag {
  /** Flag name (e.g., 'verbose') */
  name: string;
  /** Short alias (e.g., 'v') */
  alias?: string;
  /** Description */
  description: string;
  /** Whether flag is required */
  required?: boolean;
  /** Default value */
  default?: unknown;
  /** Value type */
  type: 'boolean' | 'string' | 'number' | 'array';
}

export interface CommandArg {
  /** Argument name */
  name: string;
  /** Description */
  description: string;
  /** Whether required */
  required?: boolean;
  /** Default value */
  default?: unknown;
}

export type CommandHandler = (
  args: string[],
  flags: Record<string, unknown>
) => Promise<number>;

// ============================================================================
// Categories
// ============================================================================

export type CommandCategory =
  | 'setup'
  | 'analysis'
  | 'proof'
  | 'quality'
  | 'output'
  | 'automation'
  | 'account'
  | 'experimental';

export const CATEGORY_INFO: Record<CommandCategory, CategoryInfo> = {
  setup: {
    name: 'Setup',
    description: 'Project initialization and configuration',
    icon: '🔧',
  },
  analysis: {
    name: 'Analysis',
    description: 'Code scanning and detection',
    icon: '🔍',
  },
  proof: {
    name: 'Proof',
    description: 'Verification and validation',
    icon: '✓',
  },
  quality: {
    name: 'Quality',
    description: 'Code quality and fixes',
    icon: '✨',
  },
  output: {
    name: 'Output',
    description: 'Reports and exports',
    icon: '📄',
  },
  automation: {
    name: 'Automation',
    description: 'CI/CD and automation',
    icon: '⚙️',
  },
  account: {
    name: 'Account',
    description: 'Authentication and settings',
    icon: '👤',
  },
  experimental: {
    name: 'Experimental',
    description: 'Beta features',
    icon: '🧪',
  },
};

export interface CategoryInfo {
  name: string;
  description: string;
  icon: string;
}

// ============================================================================
// Tier System
// ============================================================================

export type Tier = 'free' | 'pro' | 'enterprise';

export interface TierInfo {
  name: string;
  description: string;
  color: string;
  price?: string;
}

export const TIER_INFO: Record<Tier, TierInfo> = {
  free: {
    name: 'FREE',
    description: 'Full CLI access for individual developers',
    color: 'green',
    price: '$0',
  },
  pro: {
    name: 'PRO',
    description: 'Cloud features, team collaboration, API access',
    color: 'blue',
    price: '$29/dev/mo',
  },
  enterprise: {
    name: 'ENTERPRISE',
    description: 'SSO, audit logs, on-prem, dedicated support',
    color: 'magenta',
    price: 'Custom',
  },
};

// ============================================================================
// Registry Types
// ============================================================================

export interface CommandRegistry {
  /** All registered commands */
  commands: Map<string, CommandDefinition>;
  /** Alias to command name mapping */
  aliases: Map<string, string>;
}

export interface ResolvedCommand {
  /** The resolved command definition */
  command: CommandDefinition;
  /** Whether it was resolved via alias */
  wasAlias: boolean;
  /** Original name used to resolve */
  originalName: string;
}

export interface CommandAccess {
  /** Whether access is allowed */
  allowed: boolean;
  /** User's current tier */
  userTier: Tier;
  /** Required tier for command */
  requiredTier: Tier;
  /** Reason if denied */
  reason?: string;
  /** Upgrade URL if applicable */
  upgradeUrl?: string;
}

// ============================================================================
// Shell Completion Types
// ============================================================================

export type ShellType = 'bash' | 'zsh' | 'fish' | 'powershell';

export interface CompletionOptions {
  /** Shell type to generate for */
  shell: ShellType;
  /** CLI binary name (e.g., 'vibecheck') */
  binaryName: string;
  /** Include hidden commands */
  includeHidden?: boolean;
}
