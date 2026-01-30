/**
 * AI Chaos Agent for Reality Mode
 * 
 * An intelligent agent powered by AI that autonomously explores and tests
 * web applications, trying to find bugs, edge cases, and break things.
 * 
 * Features:
 * - Visual analysis of pages (screenshots)
 * - DOM understanding
 * - Intelligent action planning
 * - Edge case exploration
 * - Form fuzzing
 * - Error hunting
 */

import type { Page, BrowserContext } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface ChaosAgentConfig {
  /** AI provider to use */
  provider: 'anthropic' | 'openai' | 'ollama' | 'local';
  /** API key for the AI provider (not needed for ollama/local) */
  apiKey?: string;
  /** Model to use */
  model?: string;
  /** Base URL for local/ollama provider */
  baseUrl?: string;
  /** Use vision (screenshots) or DOM-only mode */
  useVision?: boolean;
  /** Maximum actions per page */
  maxActionsPerPage: number;
  /** Maximum total actions */
  maxTotalActions: number;
  /** Screenshot on every action */
  screenshotEveryAction: boolean;
  /** Enable aggressive testing (SQL injection, XSS, etc.) */
  aggressiveMode: boolean;
  /** Timeout for each action in ms */
  actionTimeout: number;
  /** Directory to save artifacts */
  artifactsDir: string;
  /** Verbose logging */
  verbose: boolean;
}

export interface ChaosAction {
  type: 'click' | 'fill' | 'select' | 'hover' | 'navigate' | 'scroll' | 'key' | 'wait' | 'screenshot';
  selector?: string;
  value?: string;
  reasoning: string;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface ActionResult {
  action: ChaosAction;
  success: boolean;
  error?: string;
  screenshot?: string;
  consoleErrors: string[];
  networkErrors: string[];
  pageChanged: boolean;
  newUrl?: string;
  timestamp: string;
}

export interface ChaosFinding {
  id: string;
  type: 'crash' | 'error' | 'unexpected_behavior' | 'security' | 'ux_issue' | 'edge_case';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  reproduction: ChaosAction[];
  screenshot?: string;
  consoleErrors: string[];
  networkErrors: string[];
  url: string;
  timestamp: string;
}

export interface ChaosSession {
  sessionId: string;
  startTime: string;
  endTime?: string;
  totalActions: number;
  findings: ChaosFinding[];
  pagesVisited: string[];
  coverage: {
    buttonsClicked: number;
    formsSubmitted: number;
    linksFollowed: number;
    inputsTested: number;
  };
}

interface PageAnalysis {
  url: string;
  title: string;
  interactiveElements: InteractiveElement[];
  forms: FormInfo[];
  currentState: string;
  suggestedActions: ChaosAction[];
}

interface InteractiveElement {
  selector: string;
  type: 'button' | 'link' | 'input' | 'select' | 'textarea' | 'checkbox' | 'radio' | 'other';
  text: string;
  isVisible: boolean;
  isEnabled: boolean;
  attributes: Record<string, string>;
}

interface FormInfo {
  selector: string;
  inputs: Array<{
    name: string;
    type: string;
    selector: string;
    required: boolean;
    placeholder?: string;
  }>;
  submitButton?: string;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Partial<ChaosAgentConfig> = {
  model: 'llava', // Default to Ollama's vision model
  baseUrl: 'http://localhost:11434', // Default Ollama URL
  useVision: true,
  maxActionsPerPage: 20,
  maxTotalActions: 100,
  screenshotEveryAction: true,
  aggressiveMode: false,
  actionTimeout: 10000,
  verbose: true,
};

// ============================================================================
// AI Chaos Agent
// ============================================================================

export class AIChaosAgent {
  private config: ChaosAgentConfig;
  private page: Page | null = null;
  private context: BrowserContext | null = null;
  private session: ChaosSession;
  private actionHistory: ActionResult[] = [];
  private consoleErrors: string[] = [];
  private networkErrors: string[] = [];

  constructor(config: Partial<ChaosAgentConfig> & { provider: 'anthropic' | 'openai' | 'ollama' | 'local' }) {
    // Default to Ollama if no provider specified
    const provider = config.provider || 'ollama';
    
    // Set default model based on provider
    const defaultModels: Record<string, string> = {
      anthropic: 'claude-sonnet-4-20250514',
      openai: 'gpt-4o',
      ollama: 'llava', // Vision model for Ollama
      local: 'llava',
    };
    
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      provider,
      model: config.model || defaultModels[provider],
    } as ChaosAgentConfig;
    
    this.session = this.initSession();
  }

  private initSession(): ChaosSession {
    return {
      sessionId: `chaos_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      startTime: new Date().toISOString(),
      totalActions: 0,
      findings: [],
      pagesVisited: [],
      coverage: {
        buttonsClicked: 0,
        formsSubmitted: 0,
        linksFollowed: 0,
        inputsTested: 0,
      },
    };
  }

  /**
   * Run the chaos agent on a page
   */
  async run(page: Page, startUrl: string): Promise<ChaosSession> {
    this.page = page;
    this.context = page.context();
    
    // Set up error listeners
    this.setupErrorListeners();
    
    // Navigate to start URL
    await this.navigateTo(startUrl);
    
    this.log('🤖 AI Chaos Agent started');
    this.log(`   Session: ${this.session.sessionId}`);
    this.log(`   Target: ${startUrl}`);
    this.log(`   Max actions: ${this.config.maxTotalActions}`);
    
    try {
      // Main exploration loop
      while (this.session.totalActions < this.config.maxTotalActions) {
        // Analyze current page
        const analysis = await this.analyzePage();
        
        if (!analysis.suggestedActions.length) {
          this.log('📭 No more actions to try on this page');
          
          // Try to find new pages to explore
          const newPage = await this.findUnexploredPage(analysis);
          if (newPage) {
            await this.navigateTo(newPage);
            continue;
          }
          
          break;
        }
        
        // Execute the best action
        const action = analysis.suggestedActions[0];
        const result = await this.executeAction(action);
        
        // Check for findings
        await this.checkForFindings(result);
        
        // Small delay between actions
        await this.wait(500);
      }
    } catch (error) {
      this.log(`❌ Agent error: ${error}`);
    }
    
    this.session.endTime = new Date().toISOString();
    
    // Generate report
    await this.saveSession();
    
    this.log('');
    this.log('━'.repeat(50));
    this.log('🤖 Chaos Agent Session Complete');
    this.log(`   Actions performed: ${this.session.totalActions}`);
    this.log(`   Findings: ${this.session.findings.length}`);
    this.log(`   Pages visited: ${this.session.pagesVisited.length}`);
    
    return this.session;
  }

  /**
   * Analyze the current page and get AI suggestions
   */
  private async analyzePage(): Promise<PageAnalysis> {
    if (!this.page) throw new Error('No page available');
    
    const url = this.page.url();
    const title = await this.page.title();
    
    // Get interactive elements
    const interactiveElements = await this.getInteractiveElements();
    
    // Get forms
    const forms = await this.getForms();
    
    // Take screenshot for AI analysis
    const screenshot = await this.page.screenshot({ type: 'png' });
    const screenshotBase64 = screenshot.toString('base64');
    
    // Get page HTML (simplified)
    const bodyHtml = await this.page.evaluate(() => {
      const body = document.body.cloneNode(true) as HTMLElement;
      // Remove scripts and styles
      body.querySelectorAll('script, style, noscript').forEach(el => el.remove());
      return body.innerHTML.slice(0, 10000); // Limit size
    });
    
    // Ask AI what to do
    const suggestedActions = await this.getAISuggestions({
      url,
      title,
      interactiveElements,
      forms,
      screenshot: screenshotBase64,
      bodyHtml,
      actionHistory: this.actionHistory.slice(-10), // Last 10 actions
      currentFindings: this.session.findings,
    });
    
    return {
      url,
      title,
      interactiveElements,
      forms,
      currentState: `Page: ${title} (${url})`,
      suggestedActions,
    };
  }

  /**
   * Get AI suggestions for next actions
   */
  private async getAISuggestions(context: {
    url: string;
    title: string;
    interactiveElements: InteractiveElement[];
    forms: FormInfo[];
    screenshot: string;
    bodyHtml: string;
    actionHistory: ActionResult[];
    currentFindings: ChaosFinding[];
  }): Promise<ChaosAction[]> {
    const systemPrompt = `You are an AI chaos testing agent. Your goal is to thoroughly test a web application by:

1. Finding bugs, errors, and crashes
2. Testing edge cases (empty inputs, very long strings, special characters)
3. Exploring all interactive elements
4. Submitting forms with various inputs
5. Finding unexpected behaviors
6. ${this.config.aggressiveMode ? 'Testing for security issues (XSS, injection, etc.)' : 'Testing normal user flows'}

You will receive:
- A screenshot of the current page
- The page HTML
- A list of interactive elements with their EXACT selectors
- Your action history

CRITICAL: You MUST use the EXACT selectors provided in the interactive elements list.
DO NOT invent selectors. DO NOT use jQuery pseudo-selectors like :contains() or :has().
Only use the selector property from the elements I provide.

Respond with a JSON array of actions to try, prioritized by importance.
Each action should have:
- type: "click" | "fill" | "select" | "hover" | "navigate" | "scroll" | "key"
- selector: MUST be copied EXACTLY from the interactive elements list (e.g. "#myButton", "button.btn-primary", "input[name='email']")
- value: (for fill/select) the value to enter
- reasoning: why this action is interesting to try (keep short, under 50 chars)
- riskLevel: "low" | "medium" | "high"

Focus on:
- Buttons that haven't been clicked
- Forms that haven't been submitted
- Input fields with edge cases (empty, long strings, special chars, SQL-like strings)
- Navigation to unexplored areas
- Error states and validation

${this.config.aggressiveMode ? `
AGGRESSIVE MODE: Also try:
- XSS payloads in inputs: <script>alert(1)</script>, javascript:alert(1)
- SQL injection patterns: ' OR '1'='1, 1; DROP TABLE users--
- Path traversal: ../../../etc/passwd
- Large inputs: 'A'.repeat(10000)
- Format strings: %s%s%s%s%s
` : ''}

Return ONLY a valid JSON array. Example:
[{"type":"click","selector":"#submit-btn","reasoning":"Test form submit","riskLevel":"low"}]`;

    const userMessage = `
Current page: ${context.title} (${context.url})

Interactive elements found:
${JSON.stringify(context.interactiveElements.slice(0, 30), null, 2)}

Forms found:
${JSON.stringify(context.forms, null, 2)}

Recent actions taken:
${context.actionHistory.map(a => `- ${a.action.type} ${a.action.selector || ''}: ${a.success ? 'success' : 'failed'}`).join('\n')}

Current findings: ${context.currentFindings.length}

What actions should I try next to find bugs and edge cases?`;

    try {
      let response: string;
      
      // Choose provider
      switch (this.config.provider) {
        case 'anthropic':
          response = await this.callAnthropic(systemPrompt, userMessage, context.screenshot);
          break;
        case 'openai':
          response = await this.callOpenAI(systemPrompt, userMessage, context.screenshot);
          break;
        case 'ollama':
          response = await this.callOllama(systemPrompt, userMessage, context.screenshot);
          break;
        case 'local':
          response = await this.callLocalAPI(systemPrompt, userMessage, context.screenshot);
          break;
        default:
          response = await this.callOllama(systemPrompt, userMessage, context.screenshot);
      }
      
      // Parse response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const actions = JSON.parse(jsonMatch[0]) as ChaosAction[];
        return actions.slice(0, 5); // Limit to 5 suggestions
      }
      
      return [];
    } catch (error) {
      this.log(`⚠️ AI suggestion error: ${error}`);
      // Fallback to basic exploration
      return this.getFallbackActions(context.interactiveElements, context.forms);
    }
  }

  /**
   * Call Anthropic API
   */
  private async callAnthropic(system: string, user: string, screenshotBase64: string): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.config.model || 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: screenshotBase64,
              },
            },
            {
              type: 'text',
              text: user,
            },
          ],
        }],
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }
    
    const data = await response.json() as { content: Array<{ text: string }> };
    return data.content[0]?.text || '';
  }

  /**
   * Call OpenAI API
   */
  private async callOpenAI(system: string, user: string, screenshotBase64: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model || 'gpt-4o',
        max_tokens: 2000,
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${screenshotBase64}`,
                },
              },
              {
                type: 'text',
                text: user,
              },
            ],
          },
        ],
      }),
    });
    
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }
    
    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices[0]?.message?.content || '';
  }

  /**
   * Call Ollama API (local, free!)
   * Supports vision models like llava, bakllava, llava-llama3
   */
  private async callOllama(system: string, user: string, screenshotBase64: string): Promise<string> {
    const baseUrl = this.config.baseUrl || 'http://localhost:11434';
    const model = this.config.model || 'llava';
    
    // Check if using vision or DOM-only mode
    const useVision = this.config.useVision !== false;
    
    const requestBody: Record<string, unknown> = {
      model,
      stream: false,
      options: {
        num_predict: 2000,
      },
    };
    
    if (useVision) {
      // Vision mode: use /api/generate with images
      requestBody.prompt = `${system}\n\n${user}`;
      requestBody.images = [screenshotBase64];
      
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json() as { response: string };
      return data.response || '';
    } else {
      // DOM-only mode: use /api/chat (works with any model)
      requestBody.messages = [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ];
      
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json() as { message: { content: string } };
      return data.message?.content || '';
    }
  }

  /**
   * Call local OpenAI-compatible API
   * Works with: llama.cpp server, vLLM, text-generation-webui, LocalAI, etc.
   */
  private async callLocalAPI(system: string, user: string, screenshotBase64: string): Promise<string> {
    const baseUrl = this.config.baseUrl || 'http://localhost:8080';
    const model = this.config.model || 'local-model';
    const useVision = this.config.useVision !== false;
    
    // Build messages array
    const messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }> = [
      { role: 'system', content: system },
    ];
    
    if (useVision) {
      messages.push({
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${screenshotBase64}`,
            },
          },
          {
            type: 'text',
            text: user,
          },
        ],
      });
    } else {
      messages.push({ role: 'user', content: user });
    }
    
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey ? { 'Authorization': `Bearer ${this.config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        messages,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Local API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices[0]?.message?.content || '';
  }

  /**
   * Fallback actions when AI is unavailable
   */
  private getFallbackActions(elements: InteractiveElement[], forms: FormInfo[]): ChaosAction[] {
    const actions: ChaosAction[] = [];
    
    // Click unclicked buttons
    for (const el of elements.filter(e => e.type === 'button' && e.isVisible && e.isEnabled)) {
      actions.push({
        type: 'click',
        selector: el.selector,
        reasoning: `Click button: ${el.text}`,
        riskLevel: 'low',
      });
    }
    
    // Fill form inputs with edge cases
    for (const form of forms) {
      for (const input of form.inputs) {
        // Empty value
        actions.push({
          type: 'fill',
          selector: input.selector,
          value: '',
          reasoning: `Test empty input: ${input.name}`,
          riskLevel: 'low',
        });
        
        // Very long string
        actions.push({
          type: 'fill',
          selector: input.selector,
          value: 'A'.repeat(1000),
          reasoning: `Test long input: ${input.name}`,
          riskLevel: 'medium',
        });
        
        // Special characters
        actions.push({
          type: 'fill',
          selector: input.selector,
          value: '<script>alert(1)</script>',
          reasoning: `Test XSS in: ${input.name}`,
          riskLevel: 'high',
        });
      }
    }
    
    return actions.slice(0, 10);
  }

  /**
   * Execute a chaos action
   */
  private async executeAction(action: ChaosAction): Promise<ActionResult> {
    if (!this.page) throw new Error('No page available');
    
    const startUrl = this.page.url();
    this.consoleErrors = [];
    this.networkErrors = [];
    
    this.log(`🎯 ${action.type.toUpperCase()}: ${action.selector || action.value || ''}`);
    this.log(`   Reason: ${action.reasoning}`);
    
    const result: ActionResult = {
      action,
      success: false,
      consoleErrors: [],
      networkErrors: [],
      pageChanged: false,
      timestamp: new Date().toISOString(),
    };
    
    try {
      await this.page.waitForLoadState('domcontentloaded');
      
      switch (action.type) {
        case 'click':
          if (action.selector) {
            await this.page.click(action.selector, { timeout: this.config.actionTimeout });
            this.session.coverage.buttonsClicked++;
          }
          break;
          
        case 'fill':
          if (action.selector && action.value !== undefined) {
            await this.page.fill(action.selector, action.value, { timeout: this.config.actionTimeout });
            this.session.coverage.inputsTested++;
          }
          break;
          
        case 'select':
          if (action.selector && action.value) {
            await this.page.selectOption(action.selector, action.value, { timeout: this.config.actionTimeout });
          }
          break;
          
        case 'hover':
          if (action.selector) {
            await this.page.hover(action.selector, { timeout: this.config.actionTimeout });
          }
          break;
          
        case 'navigate':
          if (action.value) {
            await this.page.goto(action.value, { timeout: this.config.actionTimeout });
            this.session.coverage.linksFollowed++;
          }
          break;
          
        case 'scroll':
          await this.page.evaluate(() => window.scrollBy(0, 500));
          break;
          
        case 'key':
          if (action.value) {
            await this.page.keyboard.press(action.value);
          }
          break;
          
        case 'wait':
          await this.wait(parseInt(action.value || '1000'));
          break;
      }
      
      // Wait for any navigation or loading
      await this.wait(500);
      await this.page.waitForLoadState('domcontentloaded').catch(() => {});
      
      result.success = true;
      result.newUrl = this.page.url();
      result.pageChanged = result.newUrl !== startUrl;
      
      // Track visited pages
      if (result.pageChanged && !this.session.pagesVisited.includes(result.newUrl)) {
        this.session.pagesVisited.push(result.newUrl);
        this.log(`   📍 New page: ${result.newUrl}`);
      }
      
    } catch (error) {
      result.error = String(error);
      this.log(`   ❌ Error: ${error}`);
    }
    
    // Capture errors
    result.consoleErrors = [...this.consoleErrors];
    result.networkErrors = [...this.networkErrors];
    
    // Take screenshot if configured
    if (this.config.screenshotEveryAction && this.page) {
      try {
        const screenshotPath = path.join(
          this.config.artifactsDir,
          'chaos',
          `action_${this.session.totalActions}.png`
        );
        await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
        await this.page.screenshot({ path: screenshotPath, fullPage: true });
        result.screenshot = screenshotPath;
      } catch {
        // Ignore screenshot errors
      }
    }
    
    this.actionHistory.push(result);
    this.session.totalActions++;
    
    return result;
  }

  /**
   * Check action result for findings
   */
  private async checkForFindings(result: ActionResult): Promise<void> {
    // Check for console errors
    if (result.consoleErrors.length > 0) {
      this.addFinding({
        type: 'error',
        severity: 'high',
        title: 'Console Error',
        description: `Action caused console errors:\n${result.consoleErrors.join('\n')}`,
        reproduction: this.getReproductionSteps(),
        consoleErrors: result.consoleErrors,
        networkErrors: result.networkErrors,
        screenshot: result.screenshot,
      });
    }
    
    // Check for network errors
    if (result.networkErrors.length > 0) {
      this.addFinding({
        type: 'error',
        severity: 'medium',
        title: 'Network Error',
        description: `Action caused network errors:\n${result.networkErrors.join('\n')}`,
        reproduction: this.getReproductionSteps(),
        consoleErrors: result.consoleErrors,
        networkErrors: result.networkErrors,
        screenshot: result.screenshot,
      });
    }
    
    // Check for crash indicators
    if (this.page) {
      const pageContent = await this.page.content().catch(() => '');
      
      // Check for error pages
      const errorIndicators = [
        'Internal Server Error',
        '500 Error',
        'Something went wrong',
        'Application Error',
        'Unhandled Runtime Error',
        'TypeError:',
        'ReferenceError:',
        'Cannot read property',
        'undefined is not',
      ];
      
      for (const indicator of errorIndicators) {
        if (pageContent.includes(indicator)) {
          this.addFinding({
            type: 'crash',
            severity: 'critical',
            title: `Application Error: ${indicator}`,
            description: `The action caused the application to show an error containing: "${indicator}"`,
            reproduction: this.getReproductionSteps(),
            consoleErrors: result.consoleErrors,
            networkErrors: result.networkErrors,
            screenshot: result.screenshot,
          });
          break;
        }
      }
      
      // Check for XSS success (if aggressive mode)
      if (this.config.aggressiveMode) {
        const alertTriggered = await this.page.evaluate(() => {
          return (window as unknown as { __xssTriggered?: boolean }).__xssTriggered === true;
        }).catch(() => false);
        
        if (alertTriggered) {
          this.addFinding({
            type: 'security',
            severity: 'critical',
            title: 'XSS Vulnerability',
            description: 'Successfully executed JavaScript through input injection',
            reproduction: this.getReproductionSteps(),
            consoleErrors: result.consoleErrors,
            networkErrors: result.networkErrors,
            screenshot: result.screenshot,
          });
        }
      }
    }
  }

  /**
   * Add a finding
   */
  private addFinding(finding: Omit<ChaosFinding, 'id' | 'url' | 'timestamp'>): void {
    const fullFinding: ChaosFinding = {
      id: `finding_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      url: this.page?.url() || 'unknown',
      timestamp: new Date().toISOString(),
      ...finding,
    };
    
    this.session.findings.push(fullFinding);
    
    this.log(`🔴 FINDING: ${finding.title}`);
    this.log(`   Severity: ${finding.severity}`);
    this.log(`   ${finding.description.split('\n')[0]}`);
  }

  /**
   * Get reproduction steps
   */
  private getReproductionSteps(): ChaosAction[] {
    return this.actionHistory.slice(-5).map(r => r.action);
  }

  /**
   * Find unexplored pages
   */
  private async findUnexploredPage(analysis: PageAnalysis): Promise<string | null> {
    // Look for links we haven't visited
    const links = analysis.interactiveElements.filter(e => e.type === 'link');
    
    for (const link of links) {
      const href = link.attributes['href'];
      if (href && !this.session.pagesVisited.some(p => p.includes(href))) {
        return href;
      }
    }
    
    return null;
  }

  /**
   * Navigate to URL
   */
  private async navigateTo(url: string): Promise<void> {
    if (!this.page) throw new Error('No page available');
    
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    
    if (!this.session.pagesVisited.includes(url)) {
      this.session.pagesVisited.push(url);
    }
  }

  /**
   * Get interactive elements from page
   */
  private async getInteractiveElements(): Promise<InteractiveElement[]> {
    if (!this.page) return [];
    
    return this.page.evaluate(() => {
      const elements: InteractiveElement[] = [];
      const processed = new Set<Element>();
      
      // Helper to generate a robust CSS selector
      const getSelector = (el: Element): string => {
        // Best: ID
        if (el.id && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(el.id)) {
          return `#${el.id}`;
        }
        
        // Good: data-testid or data-cy
        const testId = el.getAttribute('data-testid') || el.getAttribute('data-cy') || el.getAttribute('data-test');
        if (testId) {
          return `[data-testid="${testId}"]`;
        }
        
        // Good: name attribute for inputs
        const name = el.getAttribute('name');
        if (name && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) {
          return `${el.tagName.toLowerCase()}[name="${name}"]`;
        }
        
        // OK: aria-label
        const ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel) {
          return `${el.tagName.toLowerCase()}[aria-label="${ariaLabel}"]`;
        }
        
        // Fallback: nth-child path
        const path: string[] = [];
        let current: Element | null = el;
        while (current && current !== document.body) {
          const parent = current.parentElement;
          if (!parent) break;
          
          const siblings = Array.from(parent.children).filter(c => c.tagName === current!.tagName);
          const index = siblings.indexOf(current) + 1;
          
          if (current.id && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(current.id)) {
            path.unshift(`#${current.id}`);
            break;
          } else if (siblings.length === 1) {
            path.unshift(current.tagName.toLowerCase());
          } else {
            path.unshift(`${current.tagName.toLowerCase()}:nth-child(${index})`);
          }
          current = parent;
        }
        
        return path.join(' > ');
      };
      
      const selectors = [
        'button',
        'a[href]',
        'input:not([type="hidden"])',
        'select',
        'textarea',
        '[role="button"]',
      ];
      
      for (const selector of selectors) {
        document.querySelectorAll(selector).forEach((el) => {
          if (processed.has(el)) return;
          processed.add(el);
          
          const htmlEl = el as HTMLElement;
          const rect = htmlEl.getBoundingClientRect();
          const isVisible = rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight;
          
          // Skip invisible elements
          if (!isVisible) return;
          
          let type: InteractiveElement['type'] = 'other';
          if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') type = 'button';
          else if (el.tagName === 'A') type = 'link';
          else if (el.tagName === 'INPUT') {
            const inputType = (el as HTMLInputElement).type;
            if (inputType === 'checkbox') type = 'checkbox';
            else if (inputType === 'radio') type = 'radio';
            else type = 'input';
          }
          else if (el.tagName === 'SELECT') type = 'select';
          else if (el.tagName === 'TEXTAREA') type = 'textarea';
          
          elements.push({
            selector: getSelector(el),
            type,
            text: htmlEl.innerText?.slice(0, 50)?.trim() || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '',
            isVisible: true,
            isEnabled: !(el as HTMLButtonElement).disabled,
            attributes: {
              href: el.getAttribute('href') || '',
              type: el.getAttribute('type') || '',
              name: el.getAttribute('name') || '',
              placeholder: el.getAttribute('placeholder') || '',
            },
          });
        });
      }
      
      return elements;
    });
  }

  /**
   * Get forms from page
   */
  private async getForms(): Promise<FormInfo[]> {
    if (!this.page) return [];
    
    return this.page.evaluate(() => {
      const forms: FormInfo[] = [];
      
      document.querySelectorAll('form').forEach((form, formIndex) => {
        const inputs: FormInfo['inputs'] = [];
        
        form.querySelectorAll('input, select, textarea').forEach((input, inputIndex) => {
          const htmlInput = input as HTMLInputElement;
          inputs.push({
            name: htmlInput.name || `input_${inputIndex}`,
            type: htmlInput.type || 'text',
            selector: htmlInput.id ? `#${htmlInput.id}` : `form:nth-of-type(${formIndex + 1}) input:nth-of-type(${inputIndex + 1})`,
            required: htmlInput.required,
            placeholder: htmlInput.placeholder,
          });
        });
        
        const submitButton = form.querySelector('button[type="submit"], input[type="submit"]');
        
        forms.push({
          selector: form.id ? `#${form.id}` : `form:nth-of-type(${formIndex + 1})`,
          inputs,
          submitButton: submitButton?.id ? `#${submitButton.id}` : undefined,
        });
      });
      
      return forms;
    });
  }

  /**
   * Set up error listeners
   */
  private setupErrorListeners(): void {
    if (!this.page) return;
    
    // Console errors
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        this.consoleErrors.push(msg.text());
      }
    });
    
    // Page errors
    this.page.on('pageerror', error => {
      this.consoleErrors.push(`Page error: ${error.message}`);
    });
    
    // Network failures
    this.page.on('requestfailed', request => {
      this.networkErrors.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`);
    });
    
    // Response errors
    this.page.on('response', response => {
      if (response.status() >= 400) {
        this.networkErrors.push(`${response.status()} ${response.url()}`);
      }
    });
  }

  /**
   * Save session to disk
   */
  private async saveSession(): Promise<void> {
    const sessionDir = path.join(this.config.artifactsDir, 'chaos');
    await fs.mkdir(sessionDir, { recursive: true });
    
    const sessionPath = path.join(sessionDir, `session_${this.session.sessionId}.json`);
    await fs.writeFile(sessionPath, JSON.stringify(this.session, null, 2));
    
    // Generate HTML report
    const reportPath = path.join(sessionDir, `report_${this.session.sessionId}.html`);
    await fs.writeFile(reportPath, this.generateHtmlReport());
    
    this.log(`📄 Session saved: ${sessionPath}`);
    this.log(`📄 Report: ${reportPath}`);
  }

  /**
   * Generate HTML report
   */
  private generateHtmlReport(): string {
    const findings = this.session.findings;
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Chaos Agent Report</title>
  <style>
    :root {
      --bg: #0a0a0a;
      --card: #141414;
      --border: #2a2a2a;
      --text: #e5e5e5;
      --text-muted: #888;
      --accent: #8b5cf6;
      --critical: #ef4444;
      --high: #f97316;
      --medium: #eab308;
      --low: #22c55e;
    }
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 2rem;
    }
    
    .container { max-width: 1200px; margin: 0 auto; }
    
    header {
      text-align: center;
      margin-bottom: 3rem;
      padding-bottom: 2rem;
      border-bottom: 1px solid var(--border);
    }
    
    h1 {
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
      background: linear-gradient(135deg, #8b5cf6, #ec4899);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    
    .stat-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      text-align: center;
    }
    
    .stat-card h3 {
      color: var(--text-muted);
      font-size: 0.75rem;
      text-transform: uppercase;
      margin-bottom: 0.5rem;
    }
    
    .stat-card .value {
      font-size: 2rem;
      font-weight: 700;
      color: var(--accent);
    }
    
    .finding {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1rem;
    }
    
    .finding-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1rem;
    }
    
    .severity {
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    
    .severity.critical { background: var(--critical); }
    .severity.high { background: var(--high); }
    .severity.medium { background: var(--medium); color: black; }
    .severity.low { background: var(--low); }
    
    .reproduction {
      background: #1a1a1a;
      border-radius: 8px;
      padding: 1rem;
      margin-top: 1rem;
      font-family: monospace;
      font-size: 0.875rem;
    }
    
    .reproduction h4 { color: var(--accent); margin-bottom: 0.5rem; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🤖 AI Chaos Agent Report</h1>
      <p style="color: var(--text-muted)">Session: ${this.session.sessionId}</p>
    </header>
    
    <div class="stats">
      <div class="stat-card">
        <h3>Actions</h3>
        <div class="value">${this.session.totalActions}</div>
      </div>
      <div class="stat-card">
        <h3>Findings</h3>
        <div class="value" style="color: ${findings.length > 0 ? 'var(--critical)' : 'var(--low)'}">${findings.length}</div>
      </div>
      <div class="stat-card">
        <h3>Pages</h3>
        <div class="value">${this.session.pagesVisited.length}</div>
      </div>
      <div class="stat-card">
        <h3>Inputs Tested</h3>
        <div class="value">${this.session.coverage.inputsTested}</div>
      </div>
    </div>
    
    <h2 style="margin-bottom: 1rem">Findings</h2>
    ${findings.length === 0 ? '<p style="color: var(--text-muted)">No issues found! 🎉</p>' : ''}
    ${findings.map(f => `
    <div class="finding">
      <div class="finding-header">
        <span class="severity ${f.severity}">${f.severity}</span>
        <strong>${this.escapeHtml(f.title)}</strong>
      </div>
      <p style="color: var(--text-muted)">${this.escapeHtml(f.description)}</p>
      <p style="margin-top: 0.5rem; font-size: 0.875rem">URL: ${this.escapeHtml(f.url)}</p>
      ${f.reproduction.length > 0 ? `
      <div class="reproduction">
        <h4>Reproduction Steps:</h4>
        ${f.reproduction.map((step, i) => `${i + 1}. ${step.type} "${step.selector || step.value || ''}"<br>`).join('')}
      </div>
      ` : ''}
      ${f.consoleErrors.length > 0 ? `
      <div class="reproduction">
        <h4>Console Errors:</h4>
        ${f.consoleErrors.map(e => `• ${this.escapeHtml(e)}<br>`).join('')}
      </div>
      ` : ''}
    </div>
    `).join('')}
    
    <h2 style="margin: 2rem 0 1rem">Pages Visited</h2>
    <ul style="color: var(--text-muted)">
      ${this.session.pagesVisited.map(p => `<li>${this.escapeHtml(p)}</li>`).join('')}
    </ul>
    
    <footer style="margin-top: 3rem; text-align: center; color: var(--text-muted); font-size: 0.875rem">
      Generated by VibeCheck AI Chaos Agent • ${new Date().toISOString()}
    </footer>
  </div>
</body>
</html>`;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private log(message: string): void {
    if (this.config.verbose) {
      console.log(message);
    }
  }
}

// ============================================================================
// Exports
// ============================================================================

export async function runChaosAgent(
  page: Page,
  startUrl: string,
  config: Partial<ChaosAgentConfig> & { apiKey: string; provider: 'anthropic' | 'openai' }
): Promise<ChaosSession> {
  const agent = new AIChaosAgent(config);
  return agent.run(page, startUrl);
}
