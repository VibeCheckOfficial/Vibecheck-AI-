/**
 * Ghost Route Rule
 * 
 * Blocks references to API routes that don't exist in the truthpack.
 * Prevents hallucinated API endpoints from being used.
 */

import type { PolicyContext, PolicyViolation } from '../policy-engine.js';
import { BaseRule, type RuleConfig } from './base-rule.js';

export interface GhostRouteConfig extends RuleConfig {
  /** Paths that are always allowed (e.g., external APIs) */
  allowedExternalPaths?: string[];
  /** Check only paths starting with these prefixes */
  apiPrefixes?: string[];
}

const DEFAULT_CONFIG: GhostRouteConfig = {
  enabled: true,
  severity: 'error',
  allowedExternalPaths: [
    'https://*',
    'http://localhost:*',
  ],
  apiPrefixes: ['/api/', '/v1/', '/v2/'],
};

export class GhostRouteRule extends BaseRule {
  name = 'ghost-route';
  description = 'Block references to non-existent API endpoints';
  protected config: GhostRouteConfig;

  constructor(config: Partial<GhostRouteConfig> = {}) {
    super(config);
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  evaluate(context: PolicyContext): PolicyViolation | null {
    // Find all API endpoint claims
    const apiClaims = context.claims.filter(c => c.type === 'api_endpoint');
    
    if (apiClaims.length === 0) return null;

    // Find claims without evidence
    const ghostRoutes = apiClaims.filter(claim => {
      // Skip if explicitly allowed
      if (this.isExternalPath(claim.value)) return false;
      
      // Skip if not an API path we care about
      if (!this.isApiPath(claim.value)) return false;

      // Check if evidence exists
      const evidence = context.evidence.find(e => e.claimId === claim.id);
      return !evidence || !evidence.found;
    });

    if (ghostRoutes.length === 0) return null;

    // Return violation for the first ghost route
    const ghostRoute = ghostRoutes[0];
    const allGhostPaths = ghostRoutes.map(r => r.value).join(', ');

    return this.createViolation(
      `GHOST ROUTE: API endpoint(s) not found in truthpack: ${allGhostPaths}`,
      ghostRoute,
      this.generateSuggestion(ghostRoute.value)
    );
  }

  private isExternalPath(path: string): boolean {
    if (!this.config.allowedExternalPaths) return false;
    return this.config.allowedExternalPaths.some(pattern => 
      this.matchPattern(path, pattern)
    );
  }

  private isApiPath(path: string): boolean {
    if (!this.config.apiPrefixes || this.config.apiPrefixes.length === 0) {
      return path.startsWith('/');
    }
    return this.config.apiPrefixes.some(prefix => path.startsWith(prefix));
  }

  private generateSuggestion(path: string): string {
    // Extract possible resource name from path
    const parts = path.split('/').filter(Boolean);
    const resource = parts.find(p => !p.startsWith(':') && !p.startsWith('['));
    
    if (resource) {
      return `Create the route handler for "${path}" or check if the path is correct. Run: vibecheck truthpack --scope routes`;
    }
    return `Verify the API endpoint exists. Run: vibecheck truthpack --scope routes`;
  }
}
