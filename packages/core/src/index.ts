/**
 * @vibecheck/core - Shared core logic for hallucination prevention
 * 
 * Three-level hallucination prevention:
 * 1. Before Generation - Enhanced prompts with verified context
 * 2. During Generation - Agent firewall intercepts and validates
 * 3. After Generation - Multi-source verification and traceability
 * 
 * Plus integrated security scanning from Vibecheck-4:
 * - SARIF/HTML output formatters
 * - Secrets detection with entropy analysis
 * - Checkpoint system for fearless experimentation
 * - CLI registry with tier gating
 * - Reality mode fake detection
 * - Dependency visualization
 */

// Existing modules
export * from './utils/index.js';
export * from './context/index.js';
export * from './truthpack/index.js';
export * from './firewall/index.js';
export * from './validation/index.js';
export * from './prompt/index.js';
export * from './agents/index.js';
export * from './autofix/index.js';
export * from './ai/index.js';
export * from './hooks/index.js';
export * from './tracing/index.js';
export * from './hybrid/index.js';

// New modules (Vibecheck-4 integration)
export * from './formatters/index.js';
export * from './secrets/index.js';
export * from './checkpoint/index.js';
export * from './cli-registry/index.js';
export * from './reality/index.js';
export * from './visualization/index.js';
export * from './ci/index.js';
export * from './doctor/index.js';

// Phase 6: Trust System (Zero False Positives)
export * from './verification/index.js';

// Phase 5: Intelligence System (It Just Knows)
export * from './intelligence/index.js';

// Phase 4: Performance System (Fast is a Feature)
export * from './performance/index.js';

// Unified Hallucination Detection Engine
export * from './engine/index.js';

// High-Performance CLI Scanner Architecture
export * from './cache/index.js';
export * from './learning/index.js';
export * from './workers/index.js';
export * from './policy/index.js';
export * from './plugins/index.js';
export * from './git/index.js';

// Forge - AI Context Generator
export * from './forge/index.js';

// Ship Score Calculation
export * from './scoring/index.js';

// Reality Receipts
export * from './receipts/index.js';

// Scanners (Mock Detector, etc.)
export * from './scanners/index.js';

// External Integrations (GitHub, etc.)
export * from './integrations/index.js';

// Badge Generation
export * from './badges/index.js';

// Flow Tracing - Data flow analysis
export * from './flow-tracing/index.js';

// Fix Missions
export * from './missions/index.js';

// Chaos Agent Guardrails
export * from './reality/chaos/index.js';

// Object Storage (Videos, Screenshots)
export * from './storage/index.js';

// DocGuard - Documentation Quality & Duplicate Prevention
export * from './docguard/index.js';

// File Discovery - Centralized file walking and pattern matching
export * from './discovery/index.js';
