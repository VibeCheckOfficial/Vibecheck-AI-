/**
 * Shell Completion Generation
 * 
 * Generates shell completion scripts for bash, zsh, fish, and powershell.
 */

import type {
  CompletionOptions,
  ShellType,
  CommandDefinition,
} from './types.js';
import { listCommands, listAliases } from './registry.js';

// ============================================================================
// Main Generator
// ============================================================================

/**
 * Generate shell completion script
 */
export function generateCompletion(options: CompletionOptions): string {
  const { shell, binaryName, includeHidden = false } = options;

  const commands = includeHidden
    ? listCommands()
    : listCommands().filter(c => !c.hidden);
  const aliases = listAliases();

  switch (shell) {
    case 'bash':
      return generateBashCompletion(binaryName, commands, aliases);
    case 'zsh':
      return generateZshCompletion(binaryName, commands, aliases);
    case 'fish':
      return generateFishCompletion(binaryName, commands, aliases);
    case 'powershell':
      return generatePowershellCompletion(binaryName, commands, aliases);
    default:
      throw new Error(`Unsupported shell: ${shell}`);
  }
}

// ============================================================================
// Bash Completion
// ============================================================================

function generateBashCompletion(
  binaryName: string,
  commands: CommandDefinition[],
  aliases: Map<string, string>
): string {
  const allCommands = [
    ...commands.map(c => c.name),
    ...Array.from(aliases.keys()),
  ].join(' ');

  return `# Bash completion for ${binaryName}
# Add this to your ~/.bashrc or ~/.bash_completion

_${binaryName}_completion() {
    local cur prev commands
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"
    
    commands="${allCommands}"
    
    # Complete commands
    if [[ \${COMP_CWORD} -eq 1 ]]; then
        COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
        return 0
    fi
    
    # Complete flags based on command
    case "\${prev}" in
${commands.map(cmd => `        ${cmd.name})
            COMPREPLY=( $(compgen -W "${getCommandFlags(cmd)}" -- "\${cur}") )
            ;;`).join('\n')}
    esac
    
    return 0
}

complete -F _${binaryName}_completion ${binaryName}
`;
}

// ============================================================================
// Zsh Completion
// ============================================================================

function generateZshCompletion(
  binaryName: string,
  commands: CommandDefinition[],
  aliases: Map<string, string>
): string {
  const commandDescriptions = commands
    .map(c => `'${c.name}:${escapeZshDescription(c.description)}'`)
    .join('\n        ');

  const aliasDescriptions = Array.from(aliases.entries())
    .map(([alias, cmd]) => `'${alias}:Alias for ${cmd}'`)
    .join('\n        ');

  return `#compdef ${binaryName}
# Zsh completion for ${binaryName}
# Add this to your ~/.zshrc or a file in $fpath

_${binaryName}() {
    local curcontext="\$curcontext" state line
    typeset -A opt_args
    
    _arguments -C \\
        '1: :->command' \\
        '*: :->args'
    
    case \$state in
        command)
            _describe -t commands 'commands' commands
            local commands=(
                ${commandDescriptions}
                ${aliasDescriptions}
            )
            _describe -t commands '${binaryName} commands' commands
            ;;
        args)
            case \$words[2] in
${commands.map(cmd => `                ${cmd.name})
                    _arguments \\
                        ${getZshFlags(cmd)}
                    ;;`).join('\n')}
            esac
            ;;
    esac
}

_${binaryName}
`;
}

// ============================================================================
// Fish Completion
// ============================================================================

function generateFishCompletion(
  binaryName: string,
  commands: CommandDefinition[],
  aliases: Map<string, string>
): string {
  const lines = [
    `# Fish completion for ${binaryName}`,
    `# Add this to ~/.config/fish/completions/${binaryName}.fish`,
    '',
    `# Disable file completion by default`,
    `complete -c ${binaryName} -f`,
    '',
    `# Commands`,
  ];

  for (const cmd of commands) {
    lines.push(
      `complete -c ${binaryName} -n "__fish_use_subcommand" -a "${cmd.name}" -d "${escapeFishDescription(cmd.description)}"`
    );
  }

  // Aliases
  for (const [alias, cmdName] of aliases) {
    lines.push(
      `complete -c ${binaryName} -n "__fish_use_subcommand" -a "${alias}" -d "Alias for ${cmdName}"`
    );
  }

  lines.push('', '# Flags per command');

  for (const cmd of commands) {
    if (cmd.flags) {
      for (const flag of cmd.flags) {
        const shortOpt = flag.alias ? `-s ${flag.alias}` : '';
        lines.push(
          `complete -c ${binaryName} -n "__fish_seen_subcommand_from ${cmd.name}" -l ${flag.name} ${shortOpt} -d "${escapeFishDescription(flag.description)}"`
        );
      }
    }
  }

  return lines.join('\n');
}

// ============================================================================
// PowerShell Completion
// ============================================================================

function generatePowershellCompletion(
  binaryName: string,
  commands: CommandDefinition[],
  aliases: Map<string, string>
): string {
  const allNames = [
    ...commands.map(c => `'${c.name}'`),
    ...Array.from(aliases.keys()).map(a => `'${a}'`),
  ].join(', ');

  return `# PowerShell completion for ${binaryName}
# Add this to your PowerShell profile

Register-ArgumentCompleter -CommandName ${binaryName} -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)
    
    $commands = @(${allNames})
    
    if ($commandAst.CommandElements.Count -eq 1) {
        # Complete commands
        $commands | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
            [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
        }
    }
    else {
        # Complete flags based on command
        $command = $commandAst.CommandElements[1].Value
        $flags = switch ($command) {
${commands.map(cmd => `            '${cmd.name}' { @(${getCommandFlags(cmd).split(' ').map(f => `'${f}'`).join(', ')}) }`).join('\n')}
            default { @() }
        }
        $flags | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
            [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
        }
    }
}
`;
}

// ============================================================================
// Helpers
// ============================================================================

function getCommandFlags(cmd: CommandDefinition): string {
  const flags: string[] = ['--help'];

  if (cmd.flags) {
    for (const flag of cmd.flags) {
      flags.push(`--${flag.name}`);
      if (flag.alias) {
        flags.push(`-${flag.alias}`);
      }
    }
  }

  return flags.join(' ');
}

function getZshFlags(cmd: CommandDefinition): string {
  const flags = ["'--help[Show help]'"];

  if (cmd.flags) {
    for (const flag of cmd.flags) {
      const alias = flag.alias ? `'-${flag.alias}[${escapeZshDescription(flag.description)}]' ` : '';
      flags.push(`${alias}'--${flag.name}[${escapeZshDescription(flag.description)}]'`);
    }
  }

  return flags.join(' \\\n                        ');
}

function escapeZshDescription(text: string): string {
  return text.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function escapeFishDescription(text: string): string {
  return text.replace(/"/g, '\\"');
}

// ============================================================================
// Installation Instructions
// ============================================================================

/**
 * Get installation instructions for a shell
 */
export function getInstallInstructions(shell: ShellType, binaryName: string): string {
  switch (shell) {
    case 'bash':
      return `# Add to ~/.bashrc or ~/.bash_completion
${binaryName} completion bash >> ~/.bash_completion
source ~/.bash_completion`;

    case 'zsh':
      return `# Add to a file in your $fpath
${binaryName} completion zsh > ~/.zsh/completions/_${binaryName}
# Then add to ~/.zshrc:
fpath=(~/.zsh/completions $fpath)
autoload -Uz compinit && compinit`;

    case 'fish':
      return `# Save to Fish completions directory
${binaryName} completion fish > ~/.config/fish/completions/${binaryName}.fish`;

    case 'powershell':
      return `# Add to your PowerShell profile
${binaryName} completion powershell >> $PROFILE`;

    default:
      return `# Unknown shell: ${shell}`;
  }
}
