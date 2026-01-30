/**
 * Coder Agent
 * 
 * Generates code based on task, architecture, and context,
 * with built-in hallucination prevention.
 */

import type { ArchitectureDecision } from './architect-agent.js';
import type { ContextGatheringResult } from './context-agent.js';

export interface CodeGenerationResult {
  code: string;
  explanation: string;
  confidence: number;
  changes?: FileChange[];
}

export interface FileChange {
  file: string;
  action: 'create' | 'modify' | 'delete';
  content?: string;
  diff?: string;
}

export interface CoderAgentConfig {
  maxOutputTokens: number;
  includeComments: boolean;
  followConventions: boolean;
}

const DEFAULT_CONFIG: CoderAgentConfig = {
  maxOutputTokens: 2000,
  includeComments: true,
  followConventions: true,
};

export class CoderAgent {
  private config: CoderAgentConfig;

  constructor(config: Partial<CoderAgentConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate code for a task
   */
  async generate(
    task: string,
    architecture: ArchitectureDecision,
    context: ContextGatheringResult
  ): Promise<CodeGenerationResult> {
    // Build the generation prompt
    const prompt = this.buildPrompt(task, architecture, context);

    // Generate code (TODO: Integrate with actual LLM)
    const code = await this.callLLM(prompt);

    // Extract explanation
    const explanation = this.extractExplanation(code);

    // Calculate confidence based on context coverage
    const confidence = this.calculateConfidence(architecture, context);

    return {
      code,
      explanation,
      confidence,
    };
  }

  /**
   * Generate modifications to existing code
   */
  async modify(
    task: string,
    existingCode: string,
    context: ContextGatheringResult
  ): Promise<CodeGenerationResult> {
    // Build modification prompt
    const prompt = this.buildModificationPrompt(task, existingCode, context);

    // Generate modified code
    const code = await this.callLLM(prompt);

    // Calculate diff
    const diff = this.calculateDiff(existingCode, code);

    return {
      code,
      explanation: `Modified code to: ${task}`,
      confidence: 0.7,
      changes: [{
        file: 'target',
        action: 'modify',
        content: code,
        diff,
      }],
    };
  }

  private buildPrompt(
    task: string,
    architecture: ArchitectureDecision,
    context: ContextGatheringResult
  ): string {
    const sections: string[] = [];

    // System instructions
    sections.push(`You are a code generator with strict hallucination prevention.
Only use APIs, types, and imports that are verified in the truthpack.
Do not invent functionality that doesn't exist.`);

    // Truthpack
    if (Object.keys(context.truthpack).length > 0) {
      sections.push(`## Verified Truthpack
${JSON.stringify(context.truthpack, null, 2)}`);
    }

    // Architecture plan
    sections.push(`## Architecture Plan
Approach: ${architecture.approach}
Components: ${architecture.components.map(c => c.name).join(', ')}`);

    // Conventions
    if (context.conventions.length > 0) {
      sections.push(`## Conventions
${context.conventions.map(c => `### ${c.category}\n${c.rules.join('\n')}`).join('\n\n')}`);
    }

    // Related files
    if (context.relatedFiles.length > 0) {
      sections.push(`## Related Files
${context.relatedFiles.map(f => `### ${f.path}\n\`\`\`typescript\n${f.content}\n\`\`\``).join('\n\n')}`);
    }

    // Task
    sections.push(`## Task
${task}`);

    // Output instructions
    sections.push(`## Output
Generate the code. Include comments explaining key decisions.
Verify all imports and types exist before using them.`);

    return sections.join('\n\n');
  }

  private buildModificationPrompt(
    task: string,
    existingCode: string,
    context: ContextGatheringResult
  ): string {
    return `## Existing Code
\`\`\`typescript
${existingCode}
\`\`\`

## Truthpack
${JSON.stringify(context.truthpack, null, 2)}

## Task
Modify the existing code to: ${task}

Only change what's necessary. Preserve existing patterns and conventions.`;
  }

  private async callLLM(prompt: string): Promise<string> {
    // TODO: Implement actual LLM call
    // This would integrate with Claude, GPT, or other LLM APIs
    return '// Generated code placeholder';
  }

  private extractExplanation(code: string): string {
    // Extract explanation from comments
    const commentMatch = code.match(/\/\*\*[\s\S]*?\*\//);
    if (commentMatch) {
      return commentMatch[0].replace(/\/\*\*|\*\/|\*/g, '').trim();
    }
    return 'Code generated successfully';
  }

  private calculateConfidence(
    architecture: ArchitectureDecision,
    context: ContextGatheringResult
  ): number {
    let confidence = architecture.confidence;

    // Boost for good context coverage
    if (Object.keys(context.truthpack).length > 0) {
      confidence += 0.1;
    }
    if (context.conventions.length > 0) {
      confidence += 0.05;
    }

    return Math.min(1, confidence);
  }

  private calculateDiff(original: string, modified: string): string {
    // TODO: Implement proper diff calculation
    return `- Original: ${original.length} chars\n+ Modified: ${modified.length} chars`;
  }
}
