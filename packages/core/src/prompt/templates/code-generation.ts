/**
 * Code Generation Template
 * 
 * Template for generating code with hallucination prevention.
 */

export interface CodeGenerationParams {
  task: string;
  targetFile: string;
  context: {
    existingCode?: string;
    relatedFiles?: string[];
    conventions?: string;
    truthpack?: string;
  };
  constraints?: {
    maxLines?: number;
    style?: string;
    framework?: string;
  };
}

export class CodeGenerationTemplate {
  /**
   * Generate a prompt for code generation
   */
  static generate(params: CodeGenerationParams): string {
    const sections: string[] = [];

    // System context
    sections.push(this.generateSystemSection());

    // Truthpack grounding
    if (params.context.truthpack) {
      sections.push(this.generateTruthpackSection(params.context.truthpack));
    }

    // Conventions
    if (params.context.conventions) {
      sections.push(this.generateConventionsSection(params.context.conventions));
    }

    // Existing code context
    if (params.context.existingCode) {
      sections.push(this.generateExistingCodeSection(params.context.existingCode));
    }

    // Related files
    if (params.context.relatedFiles?.length) {
      sections.push(this.generateRelatedFilesSection(params.context.relatedFiles));
    }

    // Task
    sections.push(this.generateTaskSection(params.task, params.targetFile));

    // Constraints
    if (params.constraints) {
      sections.push(this.generateConstraintsSection(params.constraints));
    }

    // Verification instructions
    sections.push(this.generateVerificationSection());

    return sections.join('\n\n');
  }

  private static generateSystemSection(): string {
    return `## System Instructions

You are a code generation assistant with strict hallucination prevention.
Follow these rules:
1. ONLY use imports, types, and functions that are verified in the truthpack
2. NEVER invent API endpoints or environment variables
3. Follow the project conventions exactly
4. If uncertain about something, ask for clarification
5. Reference existing code patterns when available`;
  }

  private static generateTruthpackSection(truthpack: string): string {
    return `## Verified Ground Truth (Truthpack)

The following information is verified and authoritative:

${truthpack}

Use ONLY these verified facts. Do not assume or invent additional APIs, routes, or configurations.`;
  }

  private static generateConventionsSection(conventions: string): string {
    return `## Project Conventions

Follow these conventions:

${conventions}`;
  }

  private static generateExistingCodeSection(existingCode: string): string {
    return `## Existing Code Context

Current file content:

\`\`\`typescript
${existingCode}
\`\`\``;
  }

  private static generateRelatedFilesSection(relatedFiles: string[]): string {
    return `## Related Files

Consider these related files for reference:
${relatedFiles.map((f) => `- ${f}`).join('\n')}`;
  }

  private static generateTaskSection(task: string, targetFile: string): string {
    return `## Task

Target file: \`${targetFile}\`

${task}`;
  }

  private static generateConstraintsSection(constraints: {
    maxLines?: number;
    style?: string;
    framework?: string;
  }): string {
    const lines: string[] = ['## Constraints'];
    
    if (constraints.maxLines) {
      lines.push(`- Maximum lines: ${constraints.maxLines}`);
    }
    if (constraints.style) {
      lines.push(`- Style: ${constraints.style}`);
    }
    if (constraints.framework) {
      lines.push(`- Framework: ${constraints.framework}`);
    }

    return lines.join('\n');
  }

  private static generateVerificationSection(): string {
    return `## Verification Checklist

Before responding, verify:
- [ ] All imports exist in package.json or are local files
- [ ] All API endpoints exist in truthpack/routes.json
- [ ] All environment variables exist in truthpack/env.json
- [ ] All types match the truthpack/contracts.json schemas
- [ ] Code follows project conventions`;
  }
}
