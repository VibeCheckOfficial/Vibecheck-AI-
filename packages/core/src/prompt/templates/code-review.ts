/**
 * Code Review Template
 * 
 * Template for reviewing code with hallucination detection.
 */

export interface CodeReviewParams {
  code: string;
  filePath: string;
  context: {
    truthpack?: string;
    conventions?: string;
    previousVersion?: string;
  };
  reviewFocus?: ('correctness' | 'security' | 'performance' | 'style')[];
}

export class CodeReviewTemplate {
  /**
   * Generate a prompt for code review
   */
  static generate(params: CodeReviewParams): string {
    const sections: string[] = [];

    // System context
    sections.push(this.generateSystemSection());

    // Truthpack for verification
    if (params.context.truthpack) {
      sections.push(this.generateTruthpackSection(params.context.truthpack));
    }

    // Conventions for style checking
    if (params.context.conventions) {
      sections.push(this.generateConventionsSection(params.context.conventions));
    }

    // Code to review
    sections.push(this.generateCodeSection(params.code, params.filePath));

    // Previous version for diff
    if (params.context.previousVersion) {
      sections.push(this.generatePreviousVersionSection(params.context.previousVersion));
    }

    // Review focus areas
    sections.push(this.generateReviewFocusSection(params.reviewFocus));

    // Output format
    sections.push(this.generateOutputFormatSection());

    return sections.join('\n\n');
  }

  private static generateSystemSection(): string {
    return `## System Instructions

You are a code reviewer with expertise in detecting hallucinations and inconsistencies.
Your job is to:
1. Verify all imports, types, and API calls against the truthpack
2. Identify potential hallucinations (invented APIs, wrong signatures, etc.)
3. Check for convention violations
4. Flag security issues
5. Suggest improvements with verified alternatives`;
  }

  private static generateTruthpackSection(truthpack: string): string {
    return `## Verified Ground Truth

Use this to verify claims in the code:

${truthpack}

Flag any code that references APIs, types, or endpoints NOT in this truthpack.`;
  }

  private static generateConventionsSection(conventions: string): string {
    return `## Project Conventions

Check code against these conventions:

${conventions}`;
  }

  private static generateCodeSection(code: string, filePath: string): string {
    return `## Code to Review

File: \`${filePath}\`

\`\`\`typescript
${code}
\`\`\``;
  }

  private static generatePreviousVersionSection(previousVersion: string): string {
    return `## Previous Version

For reference, here's the previous version:

\`\`\`typescript
${previousVersion}
\`\`\``;
  }

  private static generateReviewFocusSection(
    focus?: ('correctness' | 'security' | 'performance' | 'style')[]
  ): string {
    const areas = focus ?? ['correctness', 'security', 'performance', 'style'];
    
    return `## Review Focus Areas

Prioritize these areas:
${areas.map((f) => `- ${f.charAt(0).toUpperCase() + f.slice(1)}`).join('\n')}`;
  }

  private static generateOutputFormatSection(): string {
    return `## Output Format

Provide your review in this format:

### Hallucination Check
- List any potential hallucinations (invented APIs, wrong signatures, etc.)
- For each, explain why it's suspicious and what the correct approach would be

### Issues Found
- List issues categorized by severity (critical, warning, info)
- Include line numbers and specific recommendations

### Convention Violations
- List any violations of project conventions
- Suggest corrections

### Summary
- Overall assessment
- Risk level (low/medium/high)
- Recommended actions`;
  }
}
