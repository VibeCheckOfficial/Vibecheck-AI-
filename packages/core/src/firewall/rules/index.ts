/**
 * Firewall Rules
 * 
 * Individual enforcement rules for the agent firewall.
 * Each rule focuses on a specific type of violation.
 */

export { GhostRouteRule } from './ghost-route.js';
export { GhostEnvRule } from './ghost-env.js';
export { AuthDriftRule } from './auth-drift.js';
export { ContractDriftRule } from './contract-drift.js';
export { ScopeExplosionRule } from './scope-explosion.js';
export { UnsafeSideEffectRule } from './unsafe-side-effect.js';

// Re-export a function to get all default rules
import { GhostRouteRule } from './ghost-route.js';
import { GhostEnvRule } from './ghost-env.js';
import { AuthDriftRule } from './auth-drift.js';
import { ContractDriftRule } from './contract-drift.js';
import { ScopeExplosionRule } from './scope-explosion.js';
import { UnsafeSideEffectRule } from './unsafe-side-effect.js';
import type { Policy } from '../policy-engine.js';

/**
 * Get all default enforcement rules
 */
export function getDefaultRules(): Policy[] {
  return [
    new GhostRouteRule().toPolicy(),
    new GhostEnvRule().toPolicy(),
    new AuthDriftRule().toPolicy(),
    new ContractDriftRule().toPolicy(),
    new ScopeExplosionRule().toPolicy(),
    new UnsafeSideEffectRule().toPolicy(),
  ];
}
