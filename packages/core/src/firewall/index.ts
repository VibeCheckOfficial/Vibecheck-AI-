/**
 * Firewall Module - Agent firewall for hallucination prevention
 * 
 * Intercepts and validates AI-generated content during generation
 * to prevent hallucinations from reaching the codebase.
 */

export { AgentFirewall, type FirewallConfig, type FirewallResult, type FirewallRequest, type QuickCheckResult, type FirewallMode } from './agent-firewall.js';
export { IntentValidator, type Intent, type IntentValidation } from './intent-validator.js';
export { ClaimExtractor, type Claim, type ClaimType } from './claim-extractor.js';
export { EvidenceResolver, type Evidence, type EvidenceSource } from './evidence-resolver.js';
export { PolicyEngine, type Policy, type PolicyDecision, type PolicyViolation, type PolicyContext } from './policy-engine.js';
export { UnblockPlanner, type UnblockPlan, type UnblockStep } from './unblock-planner.js';

// Intent management (legacy - for backward compatibility)
export { 
  IntentStore, 
  getIntentStore, 
  resetIntentStore,
  type DeclaredIntent, 
  type IntentDeclaration, 
  type IntentCheckResult 
} from './intent-store.js';

// Mission Service (Intent-centric architecture)
export {
  MissionService,
  getMissionService,
  resetMissionService,
  type MissionServiceEvents,
} from './mission-service.js';

// Enforcement rules
export { 
  getDefaultRules,
  GhostRouteRule,
  GhostEnvRule,
  AuthDriftRule,
  ContractDriftRule,
  ScopeExplosionRule,
  UnsafeSideEffectRule,
} from './rules/index.js';
export { BaseRule, type RuleConfig } from './rules/base-rule.js';
