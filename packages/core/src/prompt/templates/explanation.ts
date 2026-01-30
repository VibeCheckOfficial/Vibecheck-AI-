/**
 * Explanation Template
 * 
 * Template for generating code explanations with factual grounding.
 */

export interface ExplanationParams {
  code: string;
  filePath: string;
  context: {
    truthpack?: string;
    relatedDocs?: string;
  };
  questions?: string[];
  audience?: 'beginner' | 'intermediate' | 'expert';
}

export class ExplanationTemplate {
  /**
   * Generate a prompt for code explanation
   */
  static generate(params: ExplanationParams): string {
    const sections: string[] = [];

    // System context
    sections.push(this.generateSystemSection(params.audience ?? 'intermediate'));

    // Truthpack for grounding
    if (params.context.truthpack) {
      sections.push(this.generateTruthpackSection(params.context.truthpack));
    }

    // Related documentation
    if (params.context.relatedDocs) {
      sections.push(this.generateDocsSection(params.context.relatedDocs));
    }

    // Code to explain
    sections.push(this.generateCodeSection(params.code, params.filePath));

    // Specific questions
    if (params.questions?.length) {
      sections.push(this.generateQuestionsSection(params.questions));
    }

    // Output guidelines
    sections.push(this.generateOutputGuidelinesSection(params.audience ?? 'intermediate'));

    return sections.join('\n\n');
  }

  private static generateSystemSection(audience: string): string {
    const audienceDescriptions: Record<string, string> = {
      beginner: 'someone new to programming',
      intermediate: 'a developer familiar with the basics',
      expert: 'an experienced developer',
    };

    return `## System Instructions

You are a code explanation assistant that provides accurate, grounded explanations.
Your audience is ${audienceDescriptions[audience]}.

Rules:
1. Base all explanations on verifiable facts from the truthpack and code
2. Do NOT invent or assume functionality not present in the code
3. Clearly distinguish between what the code does vs. what it might be intended to do
4. Use accurate technical terminology
5. If uncertain about something, explicitly state the uncertainty`;
  }

  private static generateTruthpackSection(truthpack: string): string {
    return `## Verified Context

Ground your explanation in these verified facts:

${truthpack}

Reference these facts when explaining how the code interacts with other parts of the system.`;
  }

  private static generateDocsSection(docs: string): string {
    return `## Related Documentation

${docs}`;
  }

  private static generateCodeSection(code: string, filePath: string): string {
    return `## Code to Explain

File: \`${filePath}\`

\`\`\`typescript
${code}
\`\`\``;
  }

  private static generateQuestionsSection(questions: string[]): string {
    return `## Specific Questions to Address

${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`;
  }

  private static generateOutputGuidelinesSection(audience: string): string {
    const guidelines: Record<string, string[]> = {
      beginner: [
        'Use simple language and avoid jargon',
        'Explain technical terms when first used',
        'Use analogies where helpful',
        'Break down complex concepts step by step',
      ],
      intermediate: [
        'Use standard technical terminology',
        'Focus on the "why" behind design decisions',
        'Highlight patterns and best practices',
        'Connect to broader architectural concepts',
      ],
      expert: [
        'Be concise and technical',
        'Focus on non-obvious aspects',
        'Discuss trade-offs and alternatives',
        'Reference relevant design patterns',
      ],
    };

    return `## Output Guidelines

${guidelines[audience].map((g) => `- ${g}`).join('\n')}

### Structure

1. **Overview**: Brief summary of what the code does
2. **Key Components**: Explain each major part
3. **Data Flow**: How data moves through the code
4. **Integration Points**: How this connects to other parts of the system (ground in truthpack)
5. **Potential Issues**: Any concerns or edge cases (only mention verified issues)`;
  }
}
