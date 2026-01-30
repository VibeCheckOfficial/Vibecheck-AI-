/**
 * Unblock Planner
 * 
 * Generates actionable plans to resolve firewall blocks
 * by providing specific steps to fix violations.
 */

import type { PolicyDecision, PolicyViolation } from './policy-engine.js';

export interface UnblockStep {
  order: number;
  action: 'add' | 'modify' | 'verify' | 'run';
  target: string;
  description: string;
  command?: string;
  autoFixable: boolean;
}

export interface UnblockPlan {
  violations: PolicyViolation[];
  steps: UnblockStep[];
  estimatedEffort: 'trivial' | 'minor' | 'moderate' | 'significant';
  canAutoFix: boolean;
}

export class UnblockPlanner {
  /**
   * Generate an unblock plan for a blocked decision
   */
  async plan(decision: PolicyDecision): Promise<UnblockPlan> {
    const steps: UnblockStep[] = [];
    let order = 1;

    for (const violation of decision.violations) {
      const violationSteps = this.planForViolation(violation, order);
      steps.push(...violationSteps);
      order += violationSteps.length;
    }

    return {
      violations: decision.violations,
      steps,
      estimatedEffort: this.estimateEffort(steps),
      canAutoFix: steps.every((s) => s.autoFixable),
    };
  }

  /**
   * Execute auto-fixable steps
   */
  async autoFix(plan: UnblockPlan): Promise<{
    success: boolean;
    fixedSteps: number[];
    failedSteps: number[];
  }> {
    const fixedSteps: number[] = [];
    const failedSteps: number[] = [];

    for (const step of plan.steps) {
      if (step.autoFixable) {
        const success = await this.executeStep(step);
        if (success) {
          fixedSteps.push(step.order);
        } else {
          failedSteps.push(step.order);
        }
      }
    }

    return {
      success: failedSteps.length === 0,
      fixedSteps,
      failedSteps,
    };
  }

  private planForViolation(violation: PolicyViolation, startOrder: number): UnblockStep[] {
    const steps: UnblockStep[] = [];
    const claimValue = violation.claim?.value ?? 'unknown';

    switch (violation.policy) {
      case 'ghost-route':
        steps.push({
          order: startOrder,
          action: 'verify',
          target: claimValue,
          description: `Check if route "${claimValue}" should exist`,
          autoFixable: false,
        });
        steps.push({
          order: startOrder + 1,
          action: 'add',
          target: 'route handler',
          description: `Create route handler for "${claimValue}" if needed`,
          autoFixable: false,
        });
        steps.push({
          order: startOrder + 2,
          action: 'run',
          target: 'truthpack',
          description: 'Regenerate routes truthpack after creating route',
          command: 'vibecheck truth --scope routes',
          autoFixable: true,
        });
        break;

      case 'ghost-env':
        steps.push({
          order: startOrder,
          action: 'add',
          target: '.env.example',
          description: `Add "${claimValue}" to .env.example with description`,
          autoFixable: false,
        });
        steps.push({
          order: startOrder + 1,
          action: 'add',
          target: '.env',
          description: `Set value for "${claimValue}" in .env`,
          autoFixable: false,
        });
        steps.push({
          order: startOrder + 2,
          action: 'run',
          target: 'truthpack',
          description: 'Register env var in truthpack',
          command: `vibecheck register env "${claimValue}"`,
          autoFixable: true,
        });
        break;

      case 'ghost-type':
        steps.push({
          order: startOrder,
          action: 'verify',
          target: claimValue,
          description: `Check if type "${claimValue}" is imported correctly`,
          autoFixable: false,
        });
        steps.push({
          order: startOrder + 1,
          action: 'add',
          target: 'types file',
          description: `Define type "${claimValue}" if it doesn't exist`,
          autoFixable: false,
        });
        break;

      case 'ghost-import':
        // Check if it's likely a package or local import
        const isPackage = !claimValue.startsWith('.') && !claimValue.startsWith('/');
        if (isPackage) {
          steps.push({
            order: startOrder,
            action: 'run',
            target: 'package.json',
            description: `Install missing package: ${claimValue}`,
            command: `pnpm add ${claimValue}`,
            autoFixable: true,
          });
        } else {
          steps.push({
            order: startOrder,
            action: 'verify',
            target: claimValue,
            description: `Check path: "${claimValue}" - file may not exist`,
            autoFixable: false,
          });
          steps.push({
            order: startOrder + 1,
            action: 'add',
            target: claimValue,
            description: `Create file at "${claimValue}" if needed`,
            autoFixable: false,
          });
        }
        break;

      case 'ghost-file':
        steps.push({
          order: startOrder,
          action: 'verify',
          target: claimValue,
          description: `Verify file path is correct: "${claimValue}"`,
          autoFixable: false,
        });
        steps.push({
          order: startOrder + 1,
          action: 'add',
          target: claimValue,
          description: `Create file "${claimValue}" if it should exist`,
          autoFixable: false,
        });
        break;

      case 'low-confidence':
      case 'excessive-claims':
        steps.push({
          order: startOrder,
          action: 'verify',
          target: 'change scope',
          description: 'Review change - consider breaking into smaller, verified pieces',
          autoFixable: false,
        });
        steps.push({
          order: startOrder + 1,
          action: 'run',
          target: 'truthpack',
          description: 'Refresh truthpack to ensure it\'s current',
          command: 'vibecheck truth',
          autoFixable: true,
        });
        break;

      default:
        steps.push({
          order: startOrder,
          action: 'verify',
          target: violation.policy,
          description: violation.suggestion ?? 'Review and fix the violation manually',
          autoFixable: false,
        });
    }

    return steps;
  }

  private async executeStep(step: UnblockStep): Promise<boolean> {
    if (!step.command) return false;

    try {
      // Security: Parse and validate command
      // Commands should be in format: "command arg1 arg2"
      const parts = step.command.trim().split(/\s+/);
      if (parts.length === 0) {
        return false;
      }

      const command = parts[0];
      const args = parts.slice(1);

      // Allowlist: Only allow safe commands
      const ALLOWED_COMMANDS = ['npm', 'pnpm', 'npx', 'vibecheck'] as const;
      if (!ALLOWED_COMMANDS.includes(command as typeof ALLOWED_COMMANDS[number])) {
        // Command not allowed - log and skip
        return false;
      }

      // Validate arguments (no shell metacharacters)
      const DANGEROUS_CHARS = /[;&|`$(){}[\]<>'"\\]/;
      for (const arg of args) {
        if (DANGEROUS_CHARS.test(arg) || arg.includes('..')) {
          // Dangerous argument detected - skip execution
          return false;
        }
      }

      // Use execFile instead of exec to avoid shell interpretation
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const execFileAsync = promisify(execFile);

      await execFileAsync(command, args, {
        timeout: 30000, // 30 second timeout
        maxBuffer: 1024 * 1024, // 1MB buffer
      });

      // Output is available in stdout/stderr if needed for debugging
      // but we don't log to console in production code

      return true;
    } catch {
      // Step execution failed - caller should handle retry/fallback
      return false;
    }
  }

  /**
   * Format the unblock plan as human-readable text
   */
  formatPlan(plan: UnblockPlan): string {
    const lines: string[] = [
      '## Unblock Plan',
      '',
      `**Estimated Effort:** ${plan.estimatedEffort}`,
      `**Can Auto-Fix:** ${plan.canAutoFix ? 'Yes' : 'Partial/No'}`,
      '',
      '### Steps to Resolve:',
      '',
    ];

    for (const step of plan.steps) {
      const autoTag = step.autoFixable ? ' [AUTO]' : '';
      lines.push(`${step.order}. **${step.action.toUpperCase()}**${autoTag}: ${step.description}`);
      if (step.command) {
        lines.push(`   \`\`\`bash`);
        lines.push(`   ${step.command}`);
        lines.push(`   \`\`\``);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private estimateEffort(steps: UnblockStep[]): UnblockPlan['estimatedEffort'] {
    const manualSteps = steps.filter((s) => !s.autoFixable).length;
    
    if (manualSteps === 0) return 'trivial';
    if (manualSteps <= 2) return 'minor';
    if (manualSteps <= 5) return 'moderate';
    return 'significant';
  }
}
