/**
 * Prompt Module - Enhanced prompt construction for hallucination prevention
 * 
 * Builds prompts with verified context and quality analysis.
 */

export { PromptBuilder, type PromptConfig, type BuiltPrompt } from './prompt-builder.js';
export { ContextInjector, type InjectionConfig } from './context-injector.js';
export { QualityAnalyzer, type QualityReport } from './quality-analyzer.js';

// Task planning
export { 
  TaskPlanner, 
  type Task, 
  type TaskPlan, 
  type VerificationPoint, 
  type PlannerConfig 
} from './task-planner.js';

// Prompt verification
export { 
  PromptVerifier, 
  type PromptVerificationResult, 
  type VerificationIssue,
  type VerifierConfig 
} from './prompt-verifier.js';

// Templates (legacy)
export { CodeGenerationTemplate } from './templates/code-generation.js';
export { CodeReviewTemplate } from './templates/code-review.js';
export { ExplanationTemplate } from './templates/explanation.js';

// Prompt Template Builder Registry
export * from './templates/types.js';
export {
  SMART_VARIABLES,
  PROMPT_TEMPLATES,
  getTemplatesByCategory,
  getFreeTemplates,
  getProTemplates,
  getTemplateById,
  getCategoriesWithCounts,
  searchTemplates,
  detectTemplate,
} from './templates/registry.js';
