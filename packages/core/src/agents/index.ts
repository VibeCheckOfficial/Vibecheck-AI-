/**
 * Agents Module - Multi-agent orchestration for hallucination prevention
 * 
 * Specialized agents that work together to ensure code quality
 * and prevent hallucinations at every stage.
 */

export { Orchestrator, type OrchestratorConfig, type AgentTask } from './orchestrator.js';
export { ArchitectAgent, type ArchitectureDecision } from './architect-agent.js';
export { ContextAgent, type ContextGatheringResult } from './context-agent.js';
export { CoderAgent, type CodeGenerationResult } from './coder-agent.js';
export { VerifierAgent, type VerificationResult } from './verifier-agent.js';
export { 
  CodeReviewerAgent, 
  type ReviewResult, 
  type ReviewIssue, 
  type ReviewSuggestion,
  type ReviewConfig 
} from './code-reviewer-agent.js';
export { 
  SecurityAuditorAgent, 
  type SecurityAuditResult, 
  type Vulnerability, 
  type VulnerabilityType,
  type SecurityRecommendation,
  type AuditorConfig 
} from './security-auditor-agent.js';
export {
  SkillsLoader,
  type Skill,
  type SkillsConfig,
  type SkillMatch
} from './skills-loader.js';
