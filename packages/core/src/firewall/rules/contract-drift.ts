/**
 * Contract Drift Rule
 * 
 * Detects API contract violations where code deviates from defined schemas.
 * Prevents breaking changes to API interfaces.
 */

import type { PolicyContext, PolicyViolation } from '../policy-engine.js';
import { BaseRule, type RuleConfig } from './base-rule.js';

export interface ContractDriftConfig extends RuleConfig {
  /** Whether to check request schemas */
  checkRequests?: boolean;
  /** Whether to check response schemas */
  checkResponses?: boolean;
  /** Whether to allow additional properties not in schema */
  allowAdditionalProperties?: boolean;
}

const DEFAULT_CONFIG: ContractDriftConfig = {
  enabled: true,
  severity: 'warning',
  checkRequests: true,
  checkResponses: true,
  allowAdditionalProperties: true,
};

export class ContractDriftRule extends BaseRule {
  name = 'contract-drift';
  description = 'Detect API contract violations and schema mismatches';
  protected config: ContractDriftConfig;

  constructor(config: Partial<ContractDriftConfig> = {}) {
    super(config);
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  evaluate(context: PolicyContext): PolicyViolation | null {
    // Find API endpoint claims
    const apiClaims = context.claims.filter(c => c.type === 'api_endpoint');
    
    if (apiClaims.length === 0) return null;

    // Check each API claim against contract evidence
    for (const claim of apiClaims) {
      const evidence = context.evidence.find(e => e.claimId === claim.id);
      
      if (evidence?.found && evidence.details) {
        const driftIssue = this.checkForDrift(claim, evidence.details);
        if (driftIssue) {
          return driftIssue;
        }
      }
    }

    // Check type references that might indicate contract usage
    const typeRefs = context.claims.filter(c => c.type === 'type_reference');
    
    for (const typeRef of typeRefs) {
      // Look for common API contract type patterns
      if (this.isApiContractType(typeRef.value)) {
        const evidence = context.evidence.find(e => e.claimId === typeRef.id);
        
        if (!evidence || !evidence.found) {
          return this.createViolation(
            `CONTRACT DRIFT: API type "${typeRef.value}" not found in contracts`,
            typeRef,
            'Ensure API types match defined contracts in truthpack/contracts.json'
          );
        }
      }
    }

    return null;
  }

  private checkForDrift(
    claim: { value: string; context: string },
    contractDetails: Record<string, unknown>
  ): PolicyViolation | null {
    const context = claim.context;

    // Check for obvious mismatches in the context
    // This is a heuristic check - full schema validation would require parsing

    // Check for method mismatch
    if (contractDetails.method) {
      const expectedMethod = String(contractDetails.method).toUpperCase();
      const contextUpper = context.toUpperCase();
      
      const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
      for (const method of methods) {
        if (contextUpper.includes(method) && method !== expectedMethod) {
          // Context mentions a different method than expected
          if (contextUpper.includes(`FETCH`) || contextUpper.includes(`${method}(`)) {
            return this.createViolation(
              `CONTRACT DRIFT: Endpoint "${claim.value}" expects ${expectedMethod} but context suggests ${method}`,
              { ...claim, value: claim.value } as PolicyContext['claims'][0],
              `Use ${expectedMethod} method for this endpoint`
            );
          }
        }
      }
    }

    // Check for body/params when not expected
    if (contractDetails.request) {
      const request = contractDetails.request as Record<string, unknown>;
      
      // If endpoint has no body defined but code sends one
      if (!request.body && context.includes('body:')) {
        return this.createViolation(
          `CONTRACT DRIFT: Endpoint "${claim.value}" doesn't expect a request body`,
          { ...claim, value: claim.value } as PolicyContext['claims'][0],
          'Remove request body or update the API contract'
        );
      }
    }

    return null;
  }

  private isApiContractType(typeName: string): boolean {
    const contractPatterns = [
      /Request$/,
      /Response$/,
      /Params$/,
      /Query$/,
      /Body$/,
      /Schema$/,
      /Dto$/,
      /Input$/,
      /Output$/,
    ];

    return contractPatterns.some(pattern => pattern.test(typeName));
  }
}
