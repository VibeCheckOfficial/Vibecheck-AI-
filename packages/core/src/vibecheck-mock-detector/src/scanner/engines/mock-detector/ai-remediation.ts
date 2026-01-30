// src/scanner/engines/mock-detector/ai-remediation.ts

import Anthropic from '@anthropic-ai/sdk';
import type { Finding } from './types';

export interface RemediationSuggestion {
  finding: Finding;
  suggestedFix: string;
  explanation: string;
  confidence: 'high' | 'medium' | 'low';
  requiresReview: boolean;
  diff?: {
    original: string;
    fixed: string;
  };
}

export interface RemediationOptions {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  includeContext?: boolean;
  contextLines?: number;
}

const DEFAULT_OPTIONS: RemediationOptions = {
  model: 'claude-sonnet-4-20250514',
  maxTokens: 2048,
  temperature: 0,
  includeContext: true,
  contextLines: 10,
};

export class AIRemediationEngine {
  private client: Anthropic;
  private options: RemediationOptions;

  constructor(options: RemediationOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.client = new Anthropic({
      apiKey: this.options.apiKey || process.env.ANTHROPIC_API_KEY,
    });
  }

  async generateRemediation(
    finding: Finding,
    fileContent: string
  ): Promise<RemediationSuggestion> {
    const context = this.extractContext(finding, fileContent);
    const prompt = this.buildPrompt(finding, context);

    const response = await this.client.messages.create({
      model: this.options.model!,
      max_tokens: this.options.maxTokens!,
      temperature: this.options.temperature!,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    return this.parseResponse(finding, content.text, context.originalCode);
  }

  async generateBatchRemediations(
    findings: Finding[],
    fileContents: Map<string, string>
  ): Promise<RemediationSuggestion[]> {
    const suggestions: RemediationSuggestion[] = [];

    const findingsByFile = new Map<string, Finding[]>();
    for (const finding of findings) {
      if (!findingsByFile.has(finding.file)) {
        findingsByFile.set(finding.file, []);
      }
      findingsByFile.get(finding.file)!.push(finding);
    }

    for (const [file, fileFindings] of findingsByFile) {
      const content = fileContents.get(file);
      if (!content) continue;

      for (let i = 0; i < fileFindings.length; i += 5) {
        const batch = fileFindings.slice(i, i + 5);
        const batchSuggestions = await this.processBatch(batch, content);
        suggestions.push(...batchSuggestions);
      }
    }

    return suggestions;
  }

  private async processBatch(
    findings: Finding[],
    fileContent: string
  ): Promise<RemediationSuggestion[]> {
    const prompt = this.buildBatchPrompt(findings, fileContent);

    const response = await this.client.messages.create({
      model: this.options.model!,
      max_tokens: this.options.maxTokens! * 2,
      temperature: this.options.temperature!,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    return this.parseBatchResponse(findings, content.text, fileContent);
  }

  private extractContext(
    finding: Finding,
    fileContent: string
  ): { beforeLines: string[]; originalCode: string; afterLines: string[] } {
    const lines = fileContent.split('\n');
    const lineIndex = finding.line - 1;
    const contextSize = this.options.contextLines || 10;

    const startLine = Math.max(0, lineIndex - contextSize);
    const endLine = Math.min(lines.length, lineIndex + contextSize + 1);

    return {
      beforeLines: lines.slice(startLine, lineIndex),
      originalCode: lines[lineIndex] || finding.code,
      afterLines: lines.slice(lineIndex + 1, endLine),
    };
  }

  private buildPrompt(
    finding: Finding,
    context: { beforeLines: string[]; originalCode: string; afterLines: string[] }
  ): string {
    return `You are a code security expert. Fix the following mock/fake data issue.

## Issue Details
- **Rule**: ${finding.id}
- **Category**: ${finding.category}
- **Severity**: ${finding.severity}
- **Description**: ${finding.description}
- **File**: ${finding.file}
- **Line**: ${finding.line}

## Context
\`\`\`
${context.beforeLines.join('\n')}
>>> ${context.originalCode}  // <-- ISSUE HERE
${context.afterLines.join('\n')}
\`\`\`

## Task
1. Provide a fixed version of the problematic line
2. Explain what was wrong and how you fixed it
3. Rate your confidence (high/medium/low)
4. Indicate if the fix requires human review

## Response Format
Respond in JSON format:
\`\`\`json
{
  "fixedCode": "the corrected line of code",
  "explanation": "brief explanation of the fix",
  "confidence": "high|medium|low",
  "requiresReview": true|false,
  "additionalChanges": "any other changes needed (e.g., add imports, env vars)"
}
\`\`\`

## Rules
- Prefer environment variables for configuration
- Remove hardcoded credentials, replace with secure alternatives
- Replace mock data with proper data fetching
- Maintain the same functionality
- Keep the fix minimal and focused`;
  }

  private buildBatchPrompt(findings: Finding[], fileContent: string): string {
    const issuesList = findings.map((f, i) => `
### Issue ${i + 1}
- **Rule**: ${f.id}
- **Line**: ${f.line}
- **Description**: ${f.description}
- **Code**: \`${f.code.slice(0, 100)}\`
`).join('\n');

    return `You are a code security expert. Fix multiple mock/fake data issues in this file.

## File Content
\`\`\`
${fileContent.slice(0, 8000)}
\`\`\`

## Issues to Fix
${issuesList}

## Task
For each issue, provide a fix. Respond in JSON format:
\`\`\`json
{
  "fixes": [
    {
      "issueIndex": 0,
      "line": 42,
      "fixedCode": "the corrected line",
      "explanation": "brief explanation",
      "confidence": "high|medium|low",
      "requiresReview": true|false
    }
  ],
  "additionalChanges": "any file-wide changes needed"
}
\`\`\``;
  }

  private parseResponse(
    finding: Finding,
    response: string,
    originalCode: string
  ): RemediationSuggestion {
    const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/);
    if (!jsonMatch) {
      try {
        const parsed = JSON.parse(response);
        return this.createSuggestion(finding, parsed, originalCode);
      } catch {
        return this.createFallbackSuggestion(finding, response);
      }
    }

    try {
      const parsed = JSON.parse(jsonMatch[1]);
      return this.createSuggestion(finding, parsed, originalCode);
    } catch {
      return this.createFallbackSuggestion(finding, response);
    }
  }

  private parseBatchResponse(
    findings: Finding[],
    response: string,
    fileContent: string
  ): RemediationSuggestion[] {
    const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/);
    if (!jsonMatch) {
      return findings.map(f => this.createFallbackSuggestion(f, 'Failed to parse batch response'));
    }

    try {
      const parsed = JSON.parse(jsonMatch[1]);
      const lines = fileContent.split('\n');

      return parsed.fixes.map((fix: any, index: number) => {
        const finding = findings[fix.issueIndex ?? index];
        if (!finding) return null;

        const originalCode = lines[finding.line - 1] || finding.code;

        return this.createSuggestion(finding, {
          fixedCode: fix.fixedCode,
          explanation: fix.explanation,
          confidence: fix.confidence,
          requiresReview: fix.requiresReview,
        }, originalCode);
      }).filter(Boolean);
    } catch {
      return findings.map(f => this.createFallbackSuggestion(f, 'Failed to parse batch response'));
    }
  }

  private createSuggestion(
    finding: Finding,
    parsed: any,
    originalCode: string
  ): RemediationSuggestion {
    return {
      finding,
      suggestedFix: parsed.fixedCode || '',
      explanation: parsed.explanation || 'No explanation provided',
      confidence: this.normalizeConfidence(parsed.confidence),
      requiresReview: parsed.requiresReview ?? true,
      diff: {
        original: originalCode,
        fixed: parsed.fixedCode || originalCode,
      },
    };
  }

  private createFallbackSuggestion(
    finding: Finding,
    response: string
  ): RemediationSuggestion {
    return {
      finding,
      suggestedFix: '',
      explanation: `AI analysis: ${response.slice(0, 200)}...`,
      confidence: 'low',
      requiresReview: true,
    };
  }

  private normalizeConfidence(value: any): 'high' | 'medium' | 'low' {
    if (typeof value === 'string') {
      const lower = value.toLowerCase();
      if (lower === 'high') return 'high';
      if (lower === 'medium') return 'medium';
    }
    return 'low';
  }
}

export async function applyRemediation(
  filePath: string,
  suggestion: RemediationSuggestion,
  dryRun = false
): Promise<{ success: boolean; diff: string }> {
  const fs = await import('fs/promises');

  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n');

  const lineIndex = suggestion.finding.line - 1;
  const originalLine = lines[lineIndex];

  const diff = `--- ${filePath}
+++ ${filePath}
@@ -${suggestion.finding.line},1 +${suggestion.finding.line},1 @@
-${originalLine}
+${suggestion.suggestedFix}`;

  if (!dryRun && suggestion.suggestedFix) {
    lines[lineIndex] = suggestion.suggestedFix;
    await fs.writeFile(filePath, lines.join('\n'));
  }

  return { success: true, diff };
}
