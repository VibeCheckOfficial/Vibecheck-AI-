# Hallucination Reduction Strategy

## Overview

VibeCheck implements a three-level defense against AI hallucinations in code generation:

1. **Before Generation** - Enhanced prompts with verified context
2. **During Generation** - Agent firewall intercepts and validates
3. **After Generation** - Multi-source verification and traceability

## Level 1: Before Generation

### Context Injection

Every prompt is enhanced with verified context from the truthpack:

```typescript
// Context is automatically injected into prompts
const enhancedPrompt = await promptBuilder
  .setTask(userTask)
  .addContext(truthpackContext)
  .addConventions(projectConventions)
  .build();
```

### Truthpack Grounding

The truthpack provides authoritative ground truth about:

- **Routes**: All API endpoints with methods, paths, and handlers
- **Environment**: All environment variables with types and requirements
- **Auth**: Authentication configuration, roles, and permissions
- **Contracts**: API request/response schemas
- **UI Graph**: Component hierarchy and props

### Quality Analysis

Prompts are analyzed for quality before sending to the AI:

- Context coverage scoring
- Task clarity assessment
- Specificity metrics
- Grounding verification

## Level 2: During Generation

### Agent Firewall

The firewall intercepts all code generation attempts:

```typescript
const firewallResult = await agentFirewall.evaluate({
  action: 'write',
  target: 'src/api/users.ts',
  content: generatedCode,
  context: {},
});

if (!firewallResult.allowed) {
  // Block and provide unblock plan
  console.log(firewallResult.unblockPlan);
}
```

### Claim Extraction

Code is analyzed for verifiable claims:

- Import statements → Package existence
- API calls → Route existence
- Type references → Contract compliance
- Env variables → Environment configuration

### Policy Enforcement

Configurable policies determine what's allowed:

- `unverified-imports`: Block unknown packages
- `undefined-env-vars`: Block undefined environment variables
- `invalid-api-endpoints`: Block non-existent routes
- `convention-violation`: Warn about style issues

## Level 3: After Generation

### Multi-Source Verification

Generated code is verified against multiple sources:

1. Truthpack (highest authority)
2. AST analysis
3. Filesystem checks
4. Package.json validation
5. TypeScript compiler

### Drift Detection

Continuous monitoring for truthpack drift:

```typescript
const drift = await driftDetector.detect();
if (drift.hasDrift) {
  console.log('Truthpack needs refresh:', drift.recommendations);
}
```

### Audit Trail

All operations are logged for traceability:

- Firewall decisions
- File changes
- Claim verifications
- Policy violations

## Best Practices

### 1. Keep Truthpack Fresh

```bash
# Refresh truthpack regularly
pnpm vibecheck scan

# Or enable auto-refresh in config
"autoRefresh": true
```

### 2. Use Specific Prompts

```markdown
# Bad - vague
"Add user authentication"

# Good - specific with references
"Add JWT authentication to POST /api/users endpoint using the 
existing AuthService from @services/auth.ts, following the 
pattern in POST /api/login"
```

### 3. Reference Existing Patterns

Always reference existing code when asking for similar functionality:

```markdown
"Create a new service for payments following the pattern in 
@services/UserService.ts, including error handling from lines 45-80"
```

### 4. Enable Strict Mode

For maximum protection:

```json
{
  "firewall": {
    "strictMode": true,
    "allowPartialMatches": false
  }
}
```

### 5. Review Firewall Blocks

When code is blocked, use the unblock planner:

```typescript
const plan = await unblockPlanner.plan(decision);
for (const step of plan.steps) {
  console.log(`${step.order}. ${step.description}`);
}
```

## Metrics

Track hallucination prevention effectiveness:

- **Block Rate**: Percentage of generations blocked
- **False Positive Rate**: Valid code incorrectly blocked
- **Drift Score**: How current truthpack is vs codebase
- **Quality Score**: Average prompt quality

## Configuration

See `.vibecheck/config.json` for all options:

```json
{
  "firewall": {
    "enabled": true,
    "strictMode": true
  },
  "scanners": {
    "routes": { "enabled": true },
    "env": { "enabled": true },
    "auth": { "enabled": true },
    "contracts": { "enabled": true }
  }
}
```
