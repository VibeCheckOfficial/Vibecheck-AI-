/**
 * VibeCheck MCP Server Implementation
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { 
  createTransport, 
  getTransportConfigFromEnv, 
  type TransportConfig,
  type TransportType 
} from './transport/index.js';

import { registerTruthpackTools } from './tools/truthpack-tools.js';
import { registerContextTools } from './tools/context-tools.js';
import { registerFirewallTools } from './tools/firewall-tools.js';
import { registerValidationTools } from './tools/validation-tools.js';
import { registerRegistrationTools } from './tools/registration-tools.js';
import { registerIntentTools } from './tools/intent-tools.js';
import { registerPromptTools } from './tools/prompt-tools.js';
import { registerForgeTools } from './tools/forge-tools.js';
import { registerAgentRuntimeTools } from './tools/agent-runtime-tools.js';
import { registerDocGuardTools } from './tools/docguard-tools.js';
import { IntentMiddleware } from './middleware/intent-middleware.js';
import { TracingMiddleware } from './middleware/tracing-middleware.js';
import { PreGenerationHook } from './hooks/pre-generation-hook.js';
import { PostGenerationHook } from './hooks/post-generation-hook.js';
import { FileWriteHook } from './hooks/file-write-hook.js';

export class VibeCheckServer {
  private server: McpServer;
  private intentMiddleware: IntentMiddleware;
  private tracingMiddleware: TracingMiddleware;
  private preGenerationHook: PreGenerationHook;
  private postGenerationHook: PostGenerationHook;
  private fileWriteHook: FileWriteHook;

  constructor() {
    this.server = new McpServer({
      name: 'vibecheck',
      version: '1.0.0',
    });

    // Initialize middleware
    this.intentMiddleware = new IntentMiddleware();
    this.tracingMiddleware = new TracingMiddleware();

    // Initialize hooks
    this.preGenerationHook = new PreGenerationHook();
    this.postGenerationHook = new PostGenerationHook();
    this.fileWriteHook = new FileWriteHook();

    this.registerTools();
    this.registerHookTools();
    this.registerMiddlewareTools();
  }

  /**
   * Start the MCP server with the specified transport
   */
  async start(config?: TransportConfig): Promise<void> {
    const transportConfig = config ?? getTransportConfigFromEnv();
    const transport = createTransport(transportConfig);
    
    // Note: connect() automatically calls start() on the transport
    // Do NOT call start() manually to avoid "already started" errors
    await this.server.connect(transport);
    console.error(`VibeCheck MCP Server started with ${transportConfig.type} transport`);
  }

  /**
   * Start with stdio transport (default for CLI)
   */
  async startStdio(): Promise<void> {
    return this.start({ type: 'stdio' });
  }

  /**
   * Start with HTTP transport (for cloud mode)
   */
  async startHTTP(port = 3001, host = 'localhost'): Promise<void> {
    return this.start({ type: 'http', port, host, path: '/mcp' });
  }

  /**
   * Start with WebSocket transport (for real-time cloud mode)
   */
  async startWebSocket(port = 3002, host = 'localhost'): Promise<void> {
    return this.start({ type: 'websocket', port, host, path: '/mcp' });
  }

  private registerTools(): void {
    // Register all tool categories
    registerTruthpackTools(this.server);
    registerContextTools(this.server);
    registerFirewallTools(this.server);
    registerValidationTools(this.server);
    registerRegistrationTools(this.server);
    registerIntentTools(this.server);
    registerPromptTools(this.server);
    registerForgeTools(this.server);
    
    // Agent Runtime tools (BYO-agent mode)
    registerAgentRuntimeTools(this.server);
    
    // DocGuard tools (documentation quality enforcement)
    registerDocGuardTools(this.server);
  }

  /**
   * Register hook tools that wrap lifecycle hooks
   */
  private registerHookTools(): void {
    // Pre-generation hook tool
    this.server.tool(
      'hook_pre_generation',
      'Run pre-generation checks and get enhanced context before code generation',
      {
        task: z.string().describe('Description of the code generation task'),
        targetFile: z.string().optional().describe('Target file path for the generated code'),
        existingCode: z.string().optional().describe('Existing code in the target file'),
      },
      async ({ task, targetFile, existingCode }) => {
        // Trace the operation
        return this.tracingMiddleware.trace('hook_pre_generation', { task, targetFile }, async () => {
          // Validate intent
          const intentResult = this.intentMiddleware.validate('hook_pre_generation', { task, targetFile });
          
          if (!intentResult.valid) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  proceed: false,
                  warnings: intentResult.warnings,
                  reason: 'Intent validation failed',
                }, null, 2),
              }],
            };
          }

          const result = await this.preGenerationHook.execute({
            task,
            targetFile,
            existingCode,
          });

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                proceed: result.proceed,
                warnings: result.warnings,
                enhancedContext: result.enhancedContext,
                injectedPrompt: result.injectedPrompt,
              }, null, 2),
            }],
          };
        });
      }
    );

    // Post-generation hook tool
    this.server.tool(
      'hook_post_generation',
      'Validate generated code for hallucinations and issues',
      {
        generatedCode: z.string().describe('The generated code to validate'),
        targetFile: z.string().describe('Target file path'),
        originalTask: z.string().describe('Original task description'),
      },
      async ({ generatedCode, targetFile, originalTask }) => {
        return this.tracingMiddleware.trace('hook_post_generation', { targetFile, originalTask }, async () => {
          const result = await this.postGenerationHook.execute({
            generatedCode,
            targetFile,
            originalTask,
          });

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                approved: result.approved,
                hallucinationScore: result.hallucinationScore,
                issues: result.issues,
                suggestions: result.suggestions,
              }, null, 2),
            }],
          };
        });
      }
    );

    // File write hook tool
    this.server.tool(
      'hook_file_write',
      'Validate file write operation before committing',
      {
        filePath: z.string().describe('Path to the file'),
        content: z.string().describe('Content to write'),
        action: z.enum(['create', 'modify', 'delete']).describe('Type of file operation'),
        previousContent: z.string().optional().describe('Previous content of the file (for modify)'),
      },
      async ({ filePath, content, action, previousContent }) => {
        return this.tracingMiddleware.trace('hook_file_write', { filePath, action }, async () => {
          // Validate intent first
          const intentResult = this.intentMiddleware.validate('hook_file_write', { filePath, action, content });
          
          if (!intentResult.valid) {
            this.tracingMiddleware.recordBlocked('hook_file_write', { filePath, action }, intentResult.warnings.join('; '));
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  allowed: false,
                  reason: 'Intent validation failed',
                  warnings: intentResult.warnings,
                }, null, 2),
              }],
            };
          }

          const result = await this.fileWriteHook.execute({
            filePath,
            content,
            action,
            previousContent,
          });

          if (!result.allowed) {
            this.tracingMiddleware.recordBlocked('hook_file_write', { filePath, action }, 'File write validation failed');
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                allowed: result.allowed,
                changes: result.changes,
                auditEntry: {
                  timestamp: result.auditEntry.timestamp.toISOString(),
                  filePath: result.auditEntry.filePath,
                  action: result.auditEntry.action,
                  result: result.auditEntry.result,
                },
              }, null, 2),
            }],
          };
        });
      }
    );
  }

  /**
   * Register middleware tools for tracing and intent management
   */
  private registerMiddlewareTools(): void {
    // Get tracing data
    this.server.tool(
      'middleware_traces',
      'Get recent operation traces for debugging',
      {
        limit: z.number().optional().describe('Maximum number of traces to return (default: 50)'),
        tool: z.string().optional().describe('Filter by tool name'),
      },
      async ({ limit, tool }) => {
        let traces = this.tracingMiddleware.getTraces();
        
        if (tool) {
          traces = this.tracingMiddleware.getTracesByTool(tool);
        }

        traces = traces.slice(-(limit ?? 50));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              traces: traces.map(t => ({
                id: t.id,
                timestamp: t.timestamp.toISOString(),
                tool: t.tool,
                result: t.result,
                duration: t.duration,
                error: t.error,
              })),
              count: traces.length,
            }, null, 2),
          }],
        };
      }
    );

    // Get intent history
    this.server.tool(
      'middleware_intent_history',
      'Get intent validation history',
      {
        limit: z.number().optional().describe('Maximum number of entries (default: 50)'),
      },
      async ({ limit }) => {
        const history = this.intentMiddleware.getHistory().slice(-(limit ?? 50));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              history: history.map(h => ({
                tool: h.tool,
                timestamp: h.timestamp.toISOString(),
                parameters: Object.keys(h.parameters),
              })),
              count: history.length,
            }, null, 2),
          }],
        };
      }
    );

    // Export all traces
    this.server.tool(
      'middleware_export_traces',
      'Export all traces for analysis',
      {},
      async () => {
        const exported = this.tracingMiddleware.exportTraces();
        
        return {
          content: [{
            type: 'text',
            text: exported,
          }],
        };
      }
    );

    // Clear traces
    this.server.tool(
      'middleware_clear_traces',
      'Clear all stored traces',
      {},
      async () => {
        this.tracingMiddleware.clear();
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'All traces cleared',
            }, null, 2),
          }],
        };
      }
    );
  }
}
