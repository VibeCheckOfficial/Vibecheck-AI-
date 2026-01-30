# VibeCheck CLI Output Contract

This document defines the canonical output contract for all VibeCheck CLI commands.
It serves as the single source of truth for output correctness.

## Score Direction Convention

**Higher is always better.** All scores are 0-100 integers.

| Score Range | Status | Color | Meaning |
|-------------|--------|-------|---------|
| 80-100 | SHIP | Green | Ready to deploy |
| 60-79 | WARN | Yellow | Proceed with caution |
| 0-59 | BLOCK | Red | Do not deploy |

## Verdict Determination

Verdicts are determined by:
1. **Score-based**: If `score >= 80` → SHIP, `score >= 60` → WARN, else BLOCK
2. **Critical blockers**: Certain conditions force BLOCK regardless of score:
   - Missing required environment variables
   - Unprotected sensitive routes (> 2)
   - Ghost routes (> 5)
   - Credential findings in code
   - Fake auth patterns in production code

## Canonical CommandResult Structure

All commands MUST produce a result object that conforms to this structure.
JSON output serializes this object directly. Terminal UI renders from this object only.

```typescript
interface CommandResult {
  // === Identity ===
  commandName: string;        // e.g., "scan", "ship", "check"
  version: string;            // CLI version
  repoRoot: string;           // Absolute path to repository root
  
  // === Timing ===
  startedAt: string;          // ISO 8601 timestamp
  durationMs: number;         // Total wall-clock time
  phases: Phase[];            // Breakdown by phase
  
  // === Inputs ===
  inputs: {
    flags: Record<string, unknown>;  // CLI flags passed
    configPath?: string;             // Path to config file used
    includePatterns: string[];       // File patterns included
    excludePatterns: string[];       // File patterns excluded
  };
  
  // === Counts (Single Source of Truth) ===
  counts: {
    filesConsidered: number;   // Files matching patterns
    filesScanned: number;      // Files actually analyzed
    filesSkipped: number;      // Files skipped (cached, excluded)
    findingsTotal: number;     // INVARIANT: sum(findingsBySeverity)
    findingsBySeverity: {
      critical: number;
      high: number;
      medium: number;
      low: number;
    };
    findingsByType: Record<string, number>;  // e.g., { ghost_route: 3, auth_gap: 1 }
  };
  
  // === Scores (0-100, higher = better) ===
  scores: {
    overall: number;           // Primary health score
    confidence?: number;       // Analysis confidence (optional)
  };
  
  // === Verdict ===
  verdict: {
    status: 'SHIP' | 'WARN' | 'BLOCK';
    reasons: string[];         // Human-readable reasons
  };
  
  // === Artifacts ===
  artifacts: {
    reportPath?: string;
    truthpackPath?: string;
    receipts?: string[];
  };
  
  // === Messages ===
  warnings: string[];
  errors: string[];
}

interface Phase {
  name: string;
  durationMs: number;
}
```

## Count Invariants

The following invariants MUST hold for every command result:

1. `counts.findingsTotal === sum(counts.findingsBySeverity)`
2. `counts.filesConsidered >= counts.filesScanned + counts.filesSkipped`
3. `scores.overall` is an integer in range [0, 100]
4. `verdict.status` matches score thresholds unless critical blocker present

## Score Calculation

### Overall Health Score

The overall health score is calculated as:

```
score = 100 - penalty

where penalty = min(100, 
  (critical * 25) + 
  (high * 10) + 
  (medium * 3) + 
  (low * 1)
)
```

This ensures:
- Zero findings → score = 100
- 4 critical findings → score = 0 (max penalty)
- 10 high findings → score = 0
- Mixed findings scale appropriately

### Ship Score (6 Dimensions)

For the `ship` command, a more detailed Ship Score is calculated:

| Dimension | Max Points | Description |
|-----------|------------|-------------|
| Ghost Risk | 17 | Unverified routes/env vars |
| Auth Coverage | 17 | Routes with proper auth |
| Env Integrity | 17 | Required env vars present |
| Runtime Proof | 17 | Routes tested via Reality Mode |
| Contracts Alignment | 17 | API contracts match implementation |
| Mock Data Cleanliness | 17 | No fake data in production |

Total: 102 points (capped at 100)

## Terminology

Use consistent terminology across all commands:

| Canonical Term | NOT These | Description |
|----------------|-----------|-------------|
| Findings | Issues, Problems, Errors | Any detected item |
| Score | Health, Percentage, Rating | 0-100 quality metric |
| Verdict | Status, Result, Outcome | SHIP/WARN/BLOCK |
| Critical | Blocker, Severe | Highest severity |
| High | Error, Major | Second severity |
| Medium | Warning, Minor | Third severity |
| Low | Info, Hint | Lowest severity |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success (SHIP or WARN verdict) |
| 1 | Failure (BLOCK verdict or error) |
| 130 | Interrupted (SIGINT) |

## Known Historical Mismatches (Pre-Fix)

These mismatches existed before the unified output contract was implemented:

### 1. Health Calculation Fragmentation
- `scan.ts`: Custom weighted category scores (ROUTES 0.30, ENV 0.20, AUTH 0.30, CONTRACTS 0.20)
- `check.ts`: `100 - (totalIssues * 10)` arbitrary multiplier
- `validate.ts`: `(passed / total) * 100` pass rate
- `ship.ts`: `(passCount / totalChecks) * 100` check pass rate

### 2. Inconsistent Gauge Multipliers
- `validate.ts`: ERRORS = `100 - (errors * 10)`, WARNINGS = `100 - (warnings * 5)`
- `check.ts`: Hallucinations = `100 - (count * 20)`, Drift = `100 - (count * 15)`

### 3. Terminology Inconsistencies
- "Issues" (check), "Findings" (ship reality), "Errors/Warnings" (validate)
- "OVERALL HEALTH" (scan), "DEPLOYMENT READY" (ship), "VALIDATION STATUS" (validate)

### 4. No Shared JSON Structure
- Each command had different JSON output shapes
- No shared types for results

### 5. Verdict Logic Split
- Ship Score: SHIP >= 80, WARN >= 60, BLOCK < 60
- Ship command: pass/fail counts only, no score-based verdict
- Check command: No verdict, just issue counts

## Rendering Contract

All terminal output MUST render from the `CommandResult` object:

1. **Header**: Command name, version, target path, session ID
2. **Vitals**: Score gauge, finding counts by severity
3. **Phases**: Timing breakdown (if verbose)
4. **Findings**: Summary or detailed list
5. **Verdict**: SHIP/WARN/BLOCK with reasons
6. **Footer**: Artifacts, next steps

No renderer may compute scores or percentages. All numbers come from `CommandResult`.

## Testing Requirements

1. **Unit tests**: Scoring functions with known inputs/outputs
2. **Invariant tests**: Assert count consistency
3. **Snapshot tests**: Terminal output stability
4. **Integration tests**: JSON matches UI-derived values
