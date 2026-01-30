# Agent Firewall

## Overview

The Agent Firewall is VibeCheck's core defense mechanism that intercepts and validates all AI agent actions before they can affect the codebase.

## Architecture

```
┌─────────────────┐
│   AI Agent      │
│   Request       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Intent Validator│ ─── Validates action intent
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Claim Extractor │ ─── Extracts verifiable claims
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│Evidence Resolver│ ─── Resolves evidence for claims
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Policy Engine  │ ─── Applies policies to decide
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌───────┐ ┌──────────┐
│ALLOWED│ │ BLOCKED  │
└───────┘ └────┬─────┘
               │
               ▼
         ┌──────────┐
         │ Unblock  │
         │ Planner  │
         └──────────┘
```

## Components

### Intent Validator

Validates that the agent's intended action is:
- Well-formed with a clear target
- Within acceptable scope
- Not attempting scope creep

```typescript
const validation = await intentValidator.validate({
  action: 'write',
  target: 'src/api/users.ts',
  content: code,
  context: {},
});

if (!validation.valid) {
  console.log(validation.warnings);
}
```

### Claim Extractor

Extracts verifiable claims from generated code:

| Claim Type | Example | Verification Source |
|------------|---------|---------------------|
| import | `import { z } from 'zod'` | package.json |
| function_call | `db.users.findById()` | AST analysis |
| type_reference | `: UserResponse` | truthpack/contracts |
| api_endpoint | `/api/users/:id` | truthpack/routes |
| env_variable | `process.env.API_KEY` | truthpack/env |
| file_reference | `./utils/helpers` | filesystem |
| package_dependency | `@repo/shared` | package.json |

### Evidence Resolver

Resolves evidence for each claim from multiple sources:

```typescript
const evidence = await evidenceResolver.resolve(claim);
// Returns:
// {
//   claimId: 'claim-import-123',
//   found: true,
//   source: 'package_json',
//   location: { file: 'package.json', line: 15 },
//   confidence: 0.95
// }
```

### Policy Engine

Applies configurable policies to make allow/deny decisions:

```typescript
const decision = await policyEngine.evaluate({
  intent,
  claims,
  evidence,
  config: firewallConfig,
});
```

Built-in policies:
- `unverified-imports` - Block imports not in package.json
- `undefined-env-vars` - Block undefined environment variables
- `invalid-api-endpoints` - Block non-existent API endpoints
- `low-confidence-claims` - Warn about uncertain claims

### Unblock Planner

When code is blocked, generates actionable steps to resolve:

```typescript
const plan = await unblockPlanner.plan(decision);
// Returns:
// {
//   steps: [
//     { order: 1, action: 'add', target: 'package.json', description: 'Add missing dependency: zod' },
//     { order: 2, action: 'run', target: 'terminal', command: 'pnpm add zod' }
//   ],
//   estimatedEffort: 'trivial',
//   canAutoFix: true
// }
```

## Usage

### Basic Evaluation

```typescript
import { AgentFirewall } from '@vibecheck/core/firewall';

const firewall = new AgentFirewall({
  strictMode: true,
  allowPartialMatches: false,
});

const result = await firewall.evaluate({
  agentId: 'cursor-agent',
  action: 'write',
  target: 'src/api/users.ts',
  content: generatedCode,
  context: {},
});

if (result.allowed) {
  // Safe to write
} else {
  // Show issues and unblock plan
  console.log(result.decision.violations);
  console.log(result.unblockPlan);
}
```

### Quick Check

For rapid validation without full evidence resolution:

```typescript
const isSafe = await firewall.quickCheck(content);
```

## Configuration

```json
{
  "firewall": {
    "strictMode": true,
    "allowPartialMatches": false,
    "maxClaimsPerRequest": 50,
    "evidenceTimeout": 5000,
    "auditLogPath": ".vibecheck/audit/firewall.log"
  }
}
```

### Strict Mode

When enabled:
- All claims must be verified
- Any error-level policy violation blocks the action
- No partial matches are allowed

### Partial Matches

When `allowPartialMatches` is true:
- Similar imports are accepted (e.g., `lodash` vs `lodash-es`)
- Close API endpoint matches are warned but allowed

## Custom Policies

Add custom policies:

```typescript
policyEngine.addPolicy({
  name: 'no-console-log',
  description: 'Block console.log in production code',
  severity: 'warning',
  evaluate: (ctx) => {
    if (ctx.claims.some(c => c.value.includes('console.log'))) {
      return {
        policy: 'no-console-log',
        severity: 'warning',
        message: 'console.log detected',
        suggestion: 'Use proper logging instead',
      };
    }
    return null;
  },
});
```

## Audit Trail

All firewall decisions are logged:

```
[2026-01-28T10:30:00Z] [EVALUATE] [BLOCKED] {
  "agentId": "cursor-agent",
  "action": "write",
  "target": "src/api/users.ts",
  "violations": ["unverified-imports: @fake/package"],
  "auditId": "fw-1234567890-abc123"
}
```
