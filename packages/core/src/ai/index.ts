/**
 * AI Module
 * 
 * AI integration for the VibeCheck auto-fix engine.
 * Provides MCP bridge and prompt building utilities.
 */

export {
  MCPAIBridge,
  type AIFixSuggestion,
  type AIFixRequest,
  type AIFixValidation,
  type CodeChange,
  type FixConstraints,
} from './mcp-ai-bridge.js';

export {
  FixPromptBuilder,
  type PromptTemplate,
  type PromptExample,
  type BuiltPrompt,
} from './fix-prompt-builder.js';
