import * as vscode from 'vscode';
import axios from 'axios';

interface CodeExplanation {
  summary: string;
  purpose: string;
  risks: {
    level: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    mitigation: string;
  }[];
  dataFlow: {
    inputs: string[];
    outputs: string[];
    sideEffects: string[];
  };
  dependencies: string[];
  suggestions: string[];
  confidence: number;
}

interface ExplanationRequest {
  code: string;
  language: string;
  context?: string;
  focusArea?: 'security' | 'performance' | 'logic' | 'general';
}

export class AiExplainerService {
  private context: vscode.ExtensionContext;
  private outputChannel: vscode.OutputChannel;
  private panel: vscode.WebviewPanel | undefined;

  // Caching explanations to avoid redundant API calls
  private cache: Map<string, CodeExplanation> = new Map();

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.outputChannel = vscode.window.createOutputChannel('VibeCheck AI Explainer');
  }

  async explainCode(
    code: string,
    language: string,
    options: { focusArea?: string; showPanel?: boolean } = {}
  ): Promise<CodeExplanation> {
    // Check cache
    const cacheKey = this.getCacheKey(code, language, options.focusArea);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      if (options.showPanel) {
        this.showExplanationPanel(cached, code, language);
      }
      return cached;
    }

    // Try AI API first
    const config = vscode.workspace.getConfiguration('vibecheck');
    const apiKey = config.get<string>('apiKey');
    const provider = config.get<string>('autoFix.provider', 'anthropic');

    let explanation: CodeExplanation;

    if (apiKey) {
      try {
        explanation = await this.callAiApi(code, language, provider, apiKey, options.focusArea);
      } catch (error) {
        this.outputChannel.appendLine(`AI API error: ${error}`);
        explanation = this.analyzeLocally(code, language, options.focusArea);
      }
    } else {
      // Fall back to local analysis
      explanation = this.analyzeLocally(code, language, options.focusArea);
    }

    // Cache the result
    this.cache.set(cacheKey, explanation);

    // Show panel if requested
    if (options.showPanel !== false) {
      this.showExplanationPanel(explanation, code, language);
    }

    return explanation;
  }

  async explainSelection(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showWarningMessage('No active editor');
      return;
    }

    const selection = editor.selection;
    const code = selection.isEmpty
      ? editor.document.lineAt(selection.active.line).text
      : editor.document.getText(selection);

    if (!code.trim()) {
      void vscode.window.showWarningMessage('No code selected');
      return;
    }

    const language = editor.document.languageId;

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Analyzing code...',
      cancellable: false
    }, async () => {
      await this.explainCode(code, language, { showPanel: true, focusArea: 'security' });
    });
  }

  private async callAiApi(
    code: string,
    language: string,
    provider: string,
    apiKey: string,
    focusArea?: string
  ): Promise<CodeExplanation> {
    const prompt = this.buildPrompt(code, language, focusArea);

    let response: string;

    if (provider === 'anthropic') {
      const result = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          messages: [{ role: 'user', content: prompt }]
        },
        {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          }
        }
      );
      response = result.data.content[0].text;
    } else if (provider === 'openai') {
      const result = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 2000
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      response = result.data.choices[0].message.content;
    } else {
      throw new Error(`Unknown provider: ${provider}`);
    }

    return this.parseAiResponse(response);
  }

  private buildPrompt(code: string, language: string, focusArea?: string): string {
    return `Analyze this ${language} code and provide a security-focused explanation.

CODE:
\`\`\`${language}
${code}
\`\`\`

${focusArea === 'security' ? 'Focus especially on security vulnerabilities and risks.' : ''}

Respond in this exact JSON format:
{
  "summary": "One-sentence summary of what this code does",
  "purpose": "Detailed explanation of the code's purpose and logic",
  "risks": [
    {
      "level": "low|medium|high|critical",
      "description": "Description of the security risk",
      "mitigation": "How to fix or mitigate this risk"
    }
  ],
  "dataFlow": {
    "inputs": ["List of data inputs"],
    "outputs": ["List of data outputs or return values"],
    "sideEffects": ["List of side effects like network calls, file writes, etc."]
  },
  "dependencies": ["External dependencies or APIs used"],
  "suggestions": ["Improvement suggestions"],
  "confidence": 0.95
}

Only respond with valid JSON, no other text.`;
  }

  private parseAiResponse(response: string): CodeExplanation {
    // Extract JSON from response (in case there's extra text)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      this.outputChannel.appendLine('Failed to parse AI response: No JSON found in response');
      return this.getDefaultExplanation();
    }

    // Safely parse JSON - returns null on invalid input instead of throwing
    const parseResult = this.safeJsonParse(jsonMatch[0]);

    if (parseResult.error) {
      this.outputChannel.appendLine(`Failed to parse AI response: ${parseResult.error}`);
      return this.getDefaultExplanation();
    }

    // Validate the parsed result matches expected structure
    if (!this.isValidCodeExplanation(parseResult.data)) {
      this.outputChannel.appendLine('Failed to parse AI response: Parsed JSON does not match expected CodeExplanation structure');
      return this.getDefaultExplanation();
    }

    return parseResult.data;
  }

  /**
   * Safely parses JSON without throwing exceptions.
   * Returns a result object with either the parsed data or an error message.
   */
  private safeJsonParse(jsonString: string): { data: unknown; error: null } | { data: null; error: string } {
    try {
      const data: unknown = JSON.parse(jsonString);
      return { data, error: null };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown parsing error';
      return { data: null, error: errorMessage };
    }
  }

  private isValidCodeExplanation(obj: unknown): obj is CodeExplanation {
    if (typeof obj !== 'object' || obj === null) {
      return false;
    }

    const candidate = obj as Record<string, unknown>;

    // Check required string fields
    if (typeof candidate.summary !== 'string' || typeof candidate.purpose !== 'string') {
      return false;
    }

    // Check risks array
    if (!Array.isArray(candidate.risks)) {
      return false;
    }

    // Check dataFlow object
    if (typeof candidate.dataFlow !== 'object' || candidate.dataFlow === null) {
      return false;
    }

    const dataFlow = candidate.dataFlow as Record<string, unknown>;
    if (!Array.isArray(dataFlow.inputs) || !Array.isArray(dataFlow.outputs) || !Array.isArray(dataFlow.sideEffects)) {
      return false;
    }

    // Check other arrays
    if (!Array.isArray(candidate.dependencies) || !Array.isArray(candidate.suggestions)) {
      return false;
    }

    // Check confidence is a number
    if (typeof candidate.confidence !== 'number') {
      return false;
    }

    return true;
  }

  private analyzeLocally(code: string, language: string, focusArea?: string): CodeExplanation {
    const risks: CodeExplanation['risks'] = [];
    const inputs: string[] = [];
    const outputs: string[] = [];
    const sideEffects: string[] = [];
    const dependencies: string[] = [];
    const suggestions: string[] = [];

    // Detect patterns
    const patterns = [
      // Critical risks
      { regex: /eval\s*\(/g, level: 'critical' as const, desc: 'Uses eval() which can execute arbitrary code', mitigation: 'Replace with JSON.parse() or specific parsers' },
      { regex: /innerHTML\s*=/g, level: 'high' as const, desc: 'Direct innerHTML assignment can lead to XSS', mitigation: 'Use textContent or sanitize input with DOMPurify' },
      { regex: /document\.write/g, level: 'high' as const, desc: 'document.write can be exploited for XSS', mitigation: 'Use DOM manipulation methods instead' },
      { regex: /dangerouslySetInnerHTML/g, level: 'high' as const, desc: 'React dangerouslySetInnerHTML bypasses XSS protection', mitigation: 'Sanitize content with DOMPurify before use' },

      // Injection risks
      { regex: /\$\{.*\}.*query|query.*\$\{/g, level: 'critical' as const, desc: 'Possible SQL injection via string interpolation', mitigation: 'Use parameterized queries' },
      { regex: /exec\s*\([^)]*\$\{/g, level: 'critical' as const, desc: 'Command injection vulnerability', mitigation: 'Validate and sanitize all inputs' },

      // Auth/secrets
      { regex: /password\s*[:=]\s*['"`][^'"`]+['"`]/gi, level: 'critical' as const, desc: 'Hardcoded password detected', mitigation: 'Use environment variables or secure vault' },
      { regex: /api[_-]?key\s*[:=]\s*['"`][a-zA-Z0-9]+['"`]/gi, level: 'critical' as const, desc: 'Hardcoded API key', mitigation: 'Store in environment variables' },

      // Medium risks
      { regex: /JSON\.parse\s*\(/g, level: 'medium' as const, desc: 'JSON.parse can throw on invalid input', mitigation: 'Wrap in try-catch' },
      { regex: /localStorage|sessionStorage/g, level: 'medium' as const, desc: 'Browser storage is accessible to XSS attacks', mitigation: 'Don\'t store sensitive data in browser storage' },

      // Low risks
      { regex: /console\.(log|debug|info)/g, level: 'low' as const, desc: 'Console logging in production code', mitigation: 'Remove or use proper logging framework' },
      { regex: /TODO|FIXME|HACK/gi, level: 'low' as const, desc: 'Unfinished code marker detected', mitigation: 'Complete the TODO or track in issue system' }
    ];

    for (const { regex, level, desc, mitigation } of patterns) {
      if (regex.test(code)) {
        risks.push({ level, description: desc, mitigation });
      }
    }

    // Detect inputs
    if (/req\.(body|query|params|headers)/g.test(code)) {
      inputs.push('HTTP request data');
    }
    if (/useParams|useSearchParams|useQuery/g.test(code)) {
      inputs.push('URL parameters');
    }
    if (/document\.(getElementById|querySelector)/g.test(code)) {
      inputs.push('DOM elements');
    }
    if (/process\.env/g.test(code)) {
      inputs.push('Environment variables');
    }

    // Detect outputs/side effects
    if (/return\s+/g.test(code)) {
      outputs.push('Function return value');
    }
    if (/fetch\s*\(|axios\./g.test(code)) {
      sideEffects.push('Network request');
    }
    if (/fs\.(write|append|unlink)/g.test(code)) {
      sideEffects.push('File system write');
    }
    if (/setState|setStore|dispatch/g.test(code)) {
      sideEffects.push('State mutation');
    }

    // Detect dependencies
    const importMatches = code.match(/import\s+.*\s+from\s+['"]([^'"]+)['"]/g);
    if (importMatches) {
      for (const match of importMatches) {
        const pkg = match.match(/from\s+['"]([^'"]+)['"]/)?.[1];
        if (pkg && !pkg.startsWith('.') && !pkg.startsWith('/')) {
          dependencies.push(pkg);
        }
      }
    }

    // Generate summary
    let summary = 'Code snippet';
    if (code.includes('function') || code.includes('=>')) {
      summary = 'Function definition';
    }
    if (code.includes('class ')) {
      summary = 'Class definition';
    }
    if (/fetch|axios|http/i.test(code)) {
      summary += ' that makes network requests';
    }
    if (/form|submit|input/i.test(code)) {
      summary += ' handling form/user input';
    }

    // Add suggestions based on findings
    if (risks.some(r => r.level === 'critical' || r.level === 'high')) {
      suggestions.push('Address high-severity security issues before deploying');
    }
    if (!code.includes('try') && (code.includes('JSON.parse') || code.includes('fetch'))) {
      suggestions.push('Add error handling with try-catch');
    }
    if (inputs.length > 0 && !code.includes('valid') && !code.includes('sanitize')) {
      suggestions.push('Validate and sanitize user inputs');
    }

    return {
      summary,
      purpose: this.generatePurposeDescription(code, language),
      risks,
      dataFlow: { inputs, outputs, sideEffects },
      dependencies,
      suggestions,
      confidence: 0.7 // Local analysis confidence
    };
  }

  private generatePurposeDescription(code: string, language: string): string {
    const lines = code.split('\n').filter(l => l.trim());
    const features: string[] = [];

    if (/async|await|Promise/g.test(code)) features.push('handles asynchronous operations');
    if (/fetch|axios|http/gi.test(code)) features.push('makes HTTP requests');
    if (/useState|setState/g.test(code)) features.push('manages React state');
    if (/useEffect/g.test(code)) features.push('performs side effects in React');
    if (/onClick|onSubmit|onChange/g.test(code)) features.push('handles user events');
    if (/query|select|insert|update|delete/gi.test(code)) features.push('performs database operations');
    if (/fs\.|path\./g.test(code)) features.push('handles file system operations');
    if (/bcrypt|hash|encrypt|crypto/gi.test(code)) features.push('performs cryptographic operations');
    if (/jwt|token|auth/gi.test(code)) features.push('handles authentication');

    if (features.length === 0) {
      return `A ${language} code block with ${lines.length} lines that performs general operations.`;
    }

    return `This ${language} code ${features.join(', ')}.`;
  }

  private getCacheKey(code: string, language: string, focusArea?: string): string {
    const hash = this.simpleHash(code);
    return `${hash}-${language}-${focusArea || 'general'}`;
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  private getDefaultExplanation(): CodeExplanation {
    return {
      summary: 'Unable to analyze code',
      purpose: 'Analysis failed or was unavailable',
      risks: [],
      dataFlow: { inputs: [], outputs: [], sideEffects: [] },
      dependencies: [],
      suggestions: ['Try again or check API configuration'],
      confidence: 0
    };
  }

  private showExplanationPanel(explanation: CodeExplanation, code: string, language: string): void {
    if (this.panel) {
      this.panel.reveal();
    } else {
      this.panel = vscode.window.createWebviewPanel(
        'vibecheckExplainer',
        'AI Code Explanation',
        vscode.ViewColumn.Beside,
        { enableScripts: true }
      );

      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });
    }

    this.panel.webview.html = this.getExplanationHtml(explanation, code, language);
  }

  private getExplanationHtml(explanation: CodeExplanation, code: string, language: string): string {
    const riskColors: Record<string, string> = {
      low: '#3b82f6',
      medium: '#f59e0b',
      high: '#ef4444',
      critical: '#dc2626'
    };

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Code Explanation</title>
  <style>
    :root {
      --bg: #0a0a0f;
      --bg-card: #12121a;
      --border: rgba(255,255,255,0.1);
      --text: #fff;
      --text-secondary: #a0a0b0;
      --accent: #8b5cf6;
    }
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--bg);
      color: var(--text);
      padding: 24px;
      line-height: 1.6;
    }
    
    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 24px;
    }
    
    .header-icon {
      font-size: 32px;
    }
    
    .header-text h1 {
      font-size: 20px;
      font-weight: 600;
    }
    
    .header-text p {
      font-size: 13px;
      color: var(--text-secondary);
    }
    
    .confidence {
      margin-left: auto;
      padding: 6px 12px;
      background: rgba(139, 92, 246, 0.2);
      border-radius: 20px;
      font-size: 12px;
      color: var(--accent);
    }
    
    .section {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 16px;
    }
    
    .section-title {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .summary {
      font-size: 16px;
      font-weight: 500;
      margin-bottom: 12px;
    }
    
    .purpose {
      color: var(--text-secondary);
      font-size: 14px;
    }
    
    .code-block {
      background: var(--bg);
      border-radius: 8px;
      padding: 16px;
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 12px;
      overflow-x: auto;
      white-space: pre-wrap;
      max-height: 200px;
      overflow-y: auto;
    }
    
    .risk-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    
    .risk-item {
      border-left: 3px solid;
      padding-left: 12px;
    }
    
    .risk-item.low { border-color: ${riskColors.low}; }
    .risk-item.medium { border-color: ${riskColors.medium}; }
    .risk-item.high { border-color: ${riskColors.high}; }
    .risk-item.critical { border-color: ${riskColors.critical}; }
    
    .risk-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }
    
    .risk-badge {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
    }
    
    .risk-badge.low { background: rgba(59, 130, 246, 0.2); color: ${riskColors.low}; }
    .risk-badge.medium { background: rgba(245, 158, 11, 0.2); color: ${riskColors.medium}; }
    .risk-badge.high { background: rgba(239, 68, 68, 0.2); color: ${riskColors.high}; }
    .risk-badge.critical { background: rgba(220, 38, 38, 0.3); color: ${riskColors.critical}; }
    
    .risk-desc {
      font-size: 13px;
      margin-bottom: 4px;
    }
    
    .risk-mitigation {
      font-size: 12px;
      color: #10b981;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    
    .flow-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }
    
    .flow-box {
      background: var(--bg);
      border-radius: 8px;
      padding: 12px;
    }
    
    .flow-box h4 {
      font-size: 11px;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
    }
    
    .flow-item {
      font-size: 12px;
      padding: 4px 0;
      border-bottom: 1px solid var(--border);
    }
    
    .flow-item:last-child {
      border-bottom: none;
    }
    
    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    
    .tag {
      background: var(--bg);
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-family: monospace;
    }
    
    .suggestion-list {
      list-style: none;
    }
    
    .suggestion-item {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 8px 0;
      font-size: 13px;
    }
    
    .suggestion-icon {
      color: var(--accent);
    }
    
    .empty-state {
      color: var(--text-secondary);
      font-size: 13px;
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="header">
    <span class="header-icon">🧠</span>
    <div class="header-text">
      <h1>AI Code Explanation</h1>
      <p>${language} code analysis</p>
    </div>
    <span class="confidence">${Math.round(explanation.confidence * 100)}% confidence</span>
  </div>
  
  <div class="section">
    <div class="section-title">📝 Summary</div>
    <div class="summary">${explanation.summary}</div>
    <div class="purpose">${explanation.purpose}</div>
  </div>
  
  <div class="section">
    <div class="section-title">💻 Code</div>
    <div class="code-block">${this.escapeHtml(code)}</div>
  </div>
  
  ${explanation.risks.length > 0 ? `
    <div class="section">
      <div class="section-title">⚠️ Security Risks (${explanation.risks.length})</div>
      <div class="risk-list">
        ${explanation.risks.map(risk => `
          <div class="risk-item ${risk.level}">
            <div class="risk-header">
              <span class="risk-badge ${risk.level}">${risk.level}</span>
            </div>
            <div class="risk-desc">${risk.description}</div>
            <div class="risk-mitigation">💡 ${risk.mitigation}</div>
          </div>
        `).join('')}
      </div>
    </div>
  ` : ''}
  
  <div class="section">
    <div class="section-title">🔀 Data Flow</div>
    <div class="flow-grid">
      <div class="flow-box">
        <h4>Inputs</h4>
        ${explanation.dataFlow.inputs.length > 0
        ? explanation.dataFlow.inputs.map(i => `<div class="flow-item">→ ${i}</div>`).join('')
        : '<div class="empty-state">None detected</div>'
      }
      </div>
      <div class="flow-box">
        <h4>Outputs</h4>
        ${explanation.dataFlow.outputs.length > 0
        ? explanation.dataFlow.outputs.map(o => `<div class="flow-item">← ${o}</div>`).join('')
        : '<div class="empty-state">None detected</div>'
      }
      </div>
      <div class="flow-box">
        <h4>Side Effects</h4>
        ${explanation.dataFlow.sideEffects.length > 0
        ? explanation.dataFlow.sideEffects.map(s => `<div class="flow-item">⚡ ${s}</div>`).join('')
        : '<div class="empty-state">None detected</div>'
      }
      </div>
    </div>
  </div>
  
  ${explanation.dependencies.length > 0 ? `
    <div class="section">
      <div class="section-title">📦 Dependencies</div>
      <div class="tags">
        ${explanation.dependencies.map(dep => `<span class="tag">${dep}</span>`).join('')}
      </div>
    </div>
  ` : ''}
  
  ${explanation.suggestions.length > 0 ? `
    <div class="section">
      <div class="section-title">💡 Suggestions</div>
      <ul class="suggestion-list">
        ${explanation.suggestions.map(s => `
          <li class="suggestion-item">
            <span class="suggestion-icon">→</span>
            <span>${s}</span>
          </li>
        `).join('')}
      </ul>
    </div>
  ` : ''}
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async configure(): Promise<void> {
    const config = vscode.workspace.getConfiguration('vibecheck');
    const currentProvider = config.get<string>('ai.provider', 'anthropic');

    const provider = await vscode.window.showQuickPick([
      { label: 'Anthropic (Claude)', description: 'Use Claude for AI explanations', value: 'anthropic' },
      { label: 'OpenAI (GPT-4)', description: 'Use GPT-4 for AI explanations', value: 'openai' }
    ], { placeHolder: `Current: ${currentProvider}` });

    if (provider) {
      await config.update('ai.provider', provider.value, vscode.ConfigurationTarget.Global);

      // Prompt for API key if not set
      const keyConfig = provider.value === 'anthropic' ? 'ai.anthropicApiKey' : 'ai.openaiApiKey';
      const currentKey = config.get<string>(keyConfig);

      if (!currentKey) {
        const apiKey = await vscode.window.showInputBox({
          prompt: `Enter your ${provider.label.split(' ')[0]} API Key`,
          password: true,
          placeHolder: 'sk-...'
        });

        if (apiKey) {
          await config.update(keyConfig, apiKey, vscode.ConfigurationTarget.Global);
          void vscode.window.showInformationMessage(`AI provider configured: ${provider.label}`);
        }
      } else {
        void vscode.window.showInformationMessage(`AI provider set to ${provider.label}`);
      }
    }
  }
}
