/**
 * CLI Command Registry
 * 
 * Centralized command registration and resolution.
 */

import type {
  CommandDefinition,
  CommandRegistry,
  ResolvedCommand,
  CommandCategory,
  Tier,
} from './types.js';
import { RegistryError } from '../utils/errors.js';

// Lazy-load logger to avoid circular dependencies
let loggerInstance: { warn: (message: string, context?: Record<string, unknown>) => void } | null = null;

function getLogger(): { warn: (message: string, context?: Record<string, unknown>) => void } {
  if (!loggerInstance) {
    // Use console.warn as fallback - this is acceptable for non-critical warnings
    // in development. In production, this should be replaced with proper logger.
    loggerInstance = {
      warn: (message: string, context?: Record<string, unknown>) => {
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.warn(message, context);
        }
      },
    };
  }
  return loggerInstance;
}

// ============================================================================
// Global Registry
// ============================================================================

const registry: CommandRegistry = {
  commands: new Map(),
  aliases: new Map(),
};

// ============================================================================
// Registration
// ============================================================================

/**
 * Register a command
 */
export function registerCommand(command: CommandDefinition): void {
  // Validate command name
  if (!command.name || typeof command.name !== 'string') {
    throw new RegistryError('Command must have a valid name', {
      operation: 'register',
    });
  }

  // Check for duplicate
  if (registry.commands.has(command.name)) {
    throw new RegistryError(`Command already registered: ${command.name}`, {
      operation: 'register',
      commandName: command.name,
    });
  }

  // Register command
  registry.commands.set(command.name, command);

  // Register aliases
  if (command.aliases) {
    for (const alias of command.aliases) {
      if (registry.aliases.has(alias)) {
        // Duplicate alias registration - non-critical warning
        getLogger().warn('Alias already registered, skipping', { alias, commandName: command.name });
        continue;
      }
      registry.aliases.set(alias, command.name);
    }
  }
}

/**
 * Register multiple commands
 */
export function registerCommands(commands: CommandDefinition[]): void {
  for (const command of commands) {
    registerCommand(command);
  }
}

/**
 * Unregister a command
 */
export function unregisterCommand(name: string): boolean {
  const command = registry.commands.get(name);
  if (!command) {
    return false;
  }

  // Remove aliases
  if (command.aliases) {
    for (const alias of command.aliases) {
      registry.aliases.delete(alias);
    }
  }

  return registry.commands.delete(name);
}

// ============================================================================
// Resolution
// ============================================================================

/**
 * Resolve a command by name or alias
 */
export function resolveCommand(nameOrAlias: string): ResolvedCommand | null {
  // Direct lookup
  const direct = registry.commands.get(nameOrAlias);
  if (direct) {
    return {
      command: direct,
      wasAlias: false,
      originalName: nameOrAlias,
    };
  }

  // Alias lookup
  const aliasedName = registry.aliases.get(nameOrAlias);
  if (aliasedName) {
    const command = registry.commands.get(aliasedName);
    if (command) {
      return {
        command,
        wasAlias: true,
        originalName: nameOrAlias,
      };
    }
  }

  return null;
}

/**
 * Get a command by name
 */
export function getCommand(name: string): CommandDefinition | undefined {
  return registry.commands.get(name);
}

/**
 * Check if a command exists
 */
export function hasCommand(nameOrAlias: string): boolean {
  return resolveCommand(nameOrAlias) !== null;
}

// ============================================================================
// Listing
// ============================================================================

/**
 * Get all registered commands
 */
export function listCommands(): CommandDefinition[] {
  return Array.from(registry.commands.values());
}

/**
 * Get command names
 */
export function listCommandNames(): string[] {
  return Array.from(registry.commands.keys());
}

/**
 * Get all aliases
 */
export function listAliases(): Map<string, string> {
  return new Map(registry.aliases);
}

/**
 * Get commands by category
 */
export function getCommandsByCategory(category: CommandCategory): CommandDefinition[] {
  return listCommands().filter(cmd => cmd.category === category);
}

/**
 * Get commands by tier
 */
export function getCommandsByTier(tier: Tier): CommandDefinition[] {
  return listCommands().filter(cmd => cmd.tier === tier);
}

/**
 * Get free commands
 */
export function getFreeCommands(): CommandDefinition[] {
  return getCommandsByTier('free');
}

/**
 * Get team commands (Team tier or higher)
 */
export function getTeamCommands(): CommandDefinition[] {
  return getCommandsByTier('pro');
}

/**
 * Get enterprise commands
 */
export function getEnterpriseCommands(): CommandDefinition[] {
  return getCommandsByTier('enterprise');
}

/**
 * @deprecated Use getTeamCommands instead
 */
export function getProCommands(): CommandDefinition[] {
  return getTeamCommands();
}

/**
 * Get visible commands (non-hidden)
 */
export function getVisibleCommands(): CommandDefinition[] {
  return listCommands().filter(cmd => !cmd.hidden);
}

// ============================================================================
// Fuzzy Matching
// ============================================================================

/**
 * Find similar commands (for "did you mean?" suggestions)
 */
export function findSimilar(input: string, maxResults = 3): string[] {
  const commands = listCommandNames();
  const aliases = Array.from(registry.aliases.keys());
  const all = [...commands, ...aliases];

  // Calculate Levenshtein distance
  const withDistance = all.map(name => ({
    name,
    distance: levenshteinDistance(input.toLowerCase(), name.toLowerCase()),
  }));

  // Sort by distance and return closest matches
  return withDistance
    .filter(({ distance }) => distance <= 3) // Max distance of 3
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxResults)
    .map(({ name }) => name);
}

/**
 * Suggest similar commands for unknown command
 */
export function suggestSimilar(input: string): string | null {
  const similar = findSimilar(input, 1);
  return similar.length > 0 ? similar[0] : null;
}

// ============================================================================
// Grouping
// ============================================================================

/**
 * Group commands by category
 */
export function groupByCategory(): Map<CommandCategory, CommandDefinition[]> {
  const groups = new Map<CommandCategory, CommandDefinition[]>();

  for (const command of getVisibleCommands()) {
    const existing = groups.get(command.category) ?? [];
    existing.push(command);
    groups.set(command.category, existing);
  }

  return groups;
}

/**
 * Group commands by tier
 */
export function groupByTier(): Map<Tier, CommandDefinition[]> {
  const groups = new Map<Tier, CommandDefinition[]>();

  for (const command of getVisibleCommands()) {
    const existing = groups.get(command.tier) ?? [];
    existing.push(command);
    groups.set(command.tier, existing);
  }

  return groups;
}

// ============================================================================
// Registry Management
// ============================================================================

/**
 * Clear all registered commands
 */
export function clearRegistry(): void {
  registry.commands.clear();
  registry.aliases.clear();
}

/**
 * Get registry stats
 */
export function getRegistryStats(): {
  totalCommands: number;
  totalAliases: number;
  byCategory: Record<string, number>;
  byTier: Record<string, number>;
} {
  const commands = listCommands();

  const byCategory: Record<string, number> = {};
  const byTier: Record<string, number> = {};

  for (const cmd of commands) {
    byCategory[cmd.category] = (byCategory[cmd.category] ?? 0) + 1;
    byTier[cmd.tier] = (byTier[cmd.tier] ?? 0) + 1;
  }

  return {
    totalCommands: commands.length,
    totalAliases: registry.aliases.size,
    byCategory,
    byTier,
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}
