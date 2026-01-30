# Scanner Architecture

**Version**: 1.0  
**Last Updated**: 2026-01-29  
**Status**: Production Hardening

---

## Overview

This document describes the architecture of VibeCheck's scanning engines, including hallucination detection, security scanning, and code analysis. The architecture is designed for **deterministic outputs**, **extensibility**, and **performance**.

---

## Pipeline Stages

### Stage 1: Lexical Analysis
**Purpose**: Extract tokens and basic patterns from source code

**Components**:
- `ClaimExtractor` - Extracts verifiable claims (imports, API calls, env vars)
- `SecretsScanner` - Pattern matching for secrets using regex
- `HallucinationDetector` - Pattern matching for suspicious code

**Output**: Raw tokens and matches with line/column positions

**Determinism**: ✅ Stable (regex matching order is deterministic)

---

### Stage 2: AST Analysis
**Purpose**: Parse code structure for deeper analysis

**Components**:
- TypeScript parser (via `@typescript-eslint/parser`)
- AST walkers for type references, function calls
- Import resolution

**Output**: Structured AST nodes with semantic information

**Determinism**: ✅ Stable (AST structure is deterministic)

---

### Stage 3: Evidence Resolution
**Purpose**: Verify claims against ground truth (truthpack)

**Components**:
- `EvidenceResolver` - Resolves claims against truthpack
- Route matcher - Matches API endpoints to registered routes
- Package resolver - Verifies imports against package.json
- Env resolver - Verifies env vars against truthpack

**Output**: Evidence objects with `found: boolean` and `confidence: number`

**Determinism**: ⚠️ Needs improvement (currently depends on async order)

---

### Stage 4: Rule Evaluation
**Purpose**: Apply rules to generate findings

**Components**:
- `PolicyEngine` - Evaluates policies against claims/evidence
- Rule registry - Centralized rule definitions
- Severity mapper - Maps rule violations to severities

**Output**: Findings with rule ID, severity, message, evidence

**Determinism**: ⚠️ Needs improvement (rule evaluation order not stable)

---

### Stage 5: Output Generation
**Purpose**: Format findings for consumption

**Components**:
- SARIF formatter - Standard format for CI/CD
- HTML formatter - Human-readable reports
- JSON formatter - Machine-readable output

**Output**: Formatted findings with stable IDs

**Determinism**: ✅ Stable (formatters are deterministic)

---

## Deterministic Output Guarantees

### Stable Finding IDs
**Current Issue**: IDs use `Date.now()` and `Math.random()`

**Fix**: Use content-based hashing
```typescript
function generateFindingId(
  ruleId: string,
  filePath: string,
  line: number,
  column: number,
  matchedContent: string
): string {
  const content = `${ruleId}:${filePath}:${line}:${column}:${matchedContent}`;
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  return `finding-${hash.substring(0, 16)}`;
}
```

**Benefits**:
- Same finding always gets same ID
- Can detect duplicate findings
- Stable across runs

---

### Stable Ordering
**Current Issue**: Findings order depends on async execution

**Fix**: Sort findings by stable criteria
```typescript
function sortFindings(findings: Finding[]): Finding[] {
  return findings.sort((a, b) => {
    // 1. File path (alphabetical)
    if (a.filePath !== b.filePath) {
      return a.filePath.localeCompare(b.filePath);
    }
    // 2. Line number (ascending)
    if (a.line !== b.line) {
      return a.line - b.line;
    }
    // 3. Column number (ascending)
    if (a.column !== b.column) {
      return a.column - b.column;
    }
    // 4. Rule ID (alphabetical)
    return a.ruleId.localeCompare(b.ruleId);
  });
}
```

**Benefits**:
- Consistent output order
- Easier to compare scans
- Predictable for users

---

### Stable Severity Mapping
**Current Issue**: Severity mapping inconsistent across scanners

**Fix**: Centralized severity mapping
```typescript
const SEVERITY_MAP: Record<string, Severity> = {
  'ghost-route': 'error',
  'ghost-env': 'error',
  'ghost-import': 'error',
  'ghost-type': 'warning',
  'low-confidence': 'warning',
  'excessive-claims': 'info',
};
```

**Benefits**:
- Consistent severity across scanners
- Configurable severity per rule
- Clear severity hierarchy

---

## Rule Registry

### Rule Definition
```typescript
interface Rule {
  id: string;                    // Stable rule ID (e.g., 'ghost-route')
  name: string;                   // Human-readable name
  description: string;            // Rule description
  severity: 'error' | 'warning' | 'info';
  category: 'security' | 'hallucination' | 'quality';
  
  // Pattern matching
  patterns: RegExp[];             // Regex patterns to match
  astMatchers?: ASTMatcher[];     // AST-based matchers
  
  // Evidence requirements
  requiresEvidence: boolean;      // Must verify against truthpack
  evidenceTypes: EvidenceType[];  // Types of evidence needed
  
  // Confidence scoring
  baseConfidence: number;         // Base confidence (0-1)
  confidenceFactors: ConfidenceFactor[];
  
  // Suppression
  suppressible: boolean;          // Can be suppressed
  suppressionJustificationRequired: boolean;
  
  // Test fixtures
  testFixtures: TestFixture[];    // Test cases for this rule
}
```

### Rule Registration
```typescript
class RuleRegistry {
  private rules = new Map<string, Rule>();
  
  register(rule: Rule): void {
    if (this.rules.has(rule.id)) {
      throw new Error(`Rule ${rule.id} already registered`);
    }
    this.validateRule(rule);
    this.rules.set(rule.id, rule);
  }
  
  get(id: string): Rule | undefined {
    return this.rules.get(id);
  }
  
  getAll(): Rule[] {
    return Array.from(this.rules.values())
      .sort((a, b) => a.id.localeCompare(b.id));
  }
}
```

### Test Fixtures
```typescript
interface TestFixture {
  name: string;
  input: string;                  // Code to scan
  expectedFindings: ExpectedFinding[];
  shouldMatch: boolean;           // Should this trigger the rule?
}

interface ExpectedFinding {
  filePath: string;
  line: number;
  column: number;
  message: string;
  confidence: number;
}
```

---

## Confidence Scoring

### Confidence Factors
```typescript
interface ConfidenceFactor {
  name: string;
  weight: number;                 // Weight in final score (0-1)
  calculate: (context: ScanContext) => number;
}

// Example factors:
const CONFIDENCE_FACTORS: ConfidenceFactor[] = [
  {
    name: 'pattern_match_quality',
    weight: 0.3,
    calculate: (ctx) => {
      // Higher confidence for exact matches vs fuzzy matches
      return ctx.matchQuality === 'exact' ? 1.0 : 0.7;
    },
  },
  {
    name: 'evidence_quality',
    weight: 0.4,
    calculate: (ctx) => {
      // Higher confidence when evidence is strong
      return ctx.evidence?.confidence ?? 0.5;
    },
  },
  {
    name: 'context_quality',
    weight: 0.2,
    calculate: (ctx) => {
      // Higher confidence with more context
      return Math.min(1.0, ctx.contextLines / 10);
    },
  },
  {
    name: 'rule_reliability',
    weight: 0.1,
    calculate: (ctx) => {
      // Historical false positive rate
      return ctx.rule.falsePositiveRate < 0.1 ? 1.0 : 0.7;
    },
  },
];
```

### Confidence Calculation
```typescript
function calculateConfidence(
  factors: ConfidenceFactor[],
  context: ScanContext
): number {
  let totalWeight = 0;
  let weightedSum = 0;
  
  for (const factor of factors) {
    const value = factor.calculate(context);
    weightedSum += factor.weight * value;
    totalWeight += factor.weight;
  }
  
  return totalWeight > 0 ? weightedSum / totalWeight : 0.5;
}
```

---

## Performance Optimizations

### Parallelization with Limits
```typescript
class ParallelScanner {
  private readonly maxConcurrency: number;
  private readonly workerPool: WorkerPool;
  
  async scanFiles(files: string[]): Promise<Finding[]> {
    const chunks = this.chunkFiles(files, this.maxConcurrency);
    const results: Finding[] = [];
    
    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map(file => this.scanFile(file))
      );
      results.push(...chunkResults);
    }
    
    return results;
  }
  
  private chunkFiles<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      chunks.push(items.slice(i, i + size));
    }
    return chunks;
  }
}
```

### Incremental Scanning
```typescript
class IncrementalScanner {
  async scanDiff(diff: GitDiff): Promise<Finding[]> {
    const findings: Finding[] = [];
    
    // Only scan changed files
    for (const file of diff.changedFiles) {
      const fileFindings = await this.scanFile(file.path);
      findings.push(...fileFindings);
    }
    
    // Check if deleted files had findings
    for (const file of diff.deletedFiles) {
      const cachedFindings = await this.cache.get(file.path);
      if (cachedFindings) {
        // Mark as resolved
        findings.push(...this.markResolved(cachedFindings));
      }
    }
    
    return findings;
  }
}
```

### Caching Strategy
```typescript
interface CacheKey {
  filePath: string;
  fileHash: string;        // SHA-256 of file content
  ruleIds: string[];        // Rules applied
  scannerVersion: string;   // Scanner version
}

class ScanCache {
  async get(key: CacheKey): Promise<Finding[] | null> {
    const cached = await this.storage.get(key);
    if (cached && cached.scannerVersion === CURRENT_VERSION) {
      return cached.findings;
    }
    return null;
  }
  
  async set(key: CacheKey, findings: Finding[]): Promise<void> {
    await this.storage.set(key, {
      findings,
      scannerVersion: CURRENT_VERSION,
      timestamp: Date.now(),
    });
  }
}
```

---

## Evidence Receipts

### Receipt Structure
```typescript
interface EvidenceReceipt {
  id: string;                    // Stable receipt ID
  findingId: string;              // Linked finding ID
  ruleId: string;                 // Rule that generated finding
  timestamp: string;              // ISO timestamp
  
  // Evidence chain
  evidence: Evidence[];
  evidenceSources: EvidenceSource[];
  
  // Decision rationale
  decision: 'block' | 'allow' | 'warn';
  rationale: string;
  confidence: number;
  
  // Audit trail
  auditId: string;
  policyVersion: string;
}
```

### Receipt Storage
```typescript
class EvidenceReceiptStore {
  async store(receipt: EvidenceReceipt): Promise<void> {
    const path = `.vibecheck/receipts/${receipt.id}.json`;
    await fs.writeFile(path, JSON.stringify(receipt, null, 2));
  }
  
  async get(receiptId: string): Promise<EvidenceReceipt | null> {
    const path = `.vibecheck/receipts/${receiptId}.json`;
    try {
      const content = await fs.readFile(path, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
  
  async findByFinding(findingId: string): Promise<EvidenceReceipt[]> {
    // Search receipts directory for matching finding ID
    // In production, use indexed storage
  }
}
```

---

## Extensibility

### Plugin Interface
```typescript
interface ScannerPlugin {
  id: string;
  name: string;
  version: string;
  
  // Lifecycle hooks
  initialize?(config: PluginConfig): Promise<void>;
  scan?(file: File, context: ScanContext): Promise<Finding[]>;
  cleanup?(): Promise<void>;
  
  // Rule registration
  registerRules?(registry: RuleRegistry): void;
  
  // No hidden global state
  // All state must be passed via context
}
```

### Plugin Contract
```typescript
class PluginLoader {
  async loadPlugin(path: string): Promise<ScannerPlugin> {
    // Load plugin in sandbox
    const plugin = await this.sandbox.load(path);
    
    // Validate plugin contract
    this.validatePlugin(plugin);
    
    // Initialize plugin
    if (plugin.initialize) {
      await plugin.initialize(this.config);
    }
    
    return plugin;
  }
  
  private validatePlugin(plugin: ScannerPlugin): void {
    if (!plugin.id || !plugin.name || !plugin.version) {
      throw new Error('Plugin missing required fields');
    }
    
    // Check for hidden global state
    if (this.detectGlobalState(plugin)) {
      throw new Error('Plugin uses hidden global state');
    }
  }
}
```

---

## Golden Tests

### Test Structure
```typescript
describe('Scanner Golden Tests', () => {
  const testCases = [
    {
      name: 'ghost-route-detection',
      input: `
        import { fetch } from './api';
        const data = await fetch('/api/users/123');
      `,
      expectedFindings: [
        {
          ruleId: 'ghost-route',
          filePath: 'test.ts',
          line: 2,
          column: 30,
          message: 'GHOST ROUTE: /api/users/123 not found in truthpack',
          severity: 'error',
          confidence: 0.9,
        },
      ],
    },
  ];
  
  for (const testCase of testCases) {
    it(`should detect ${testCase.name}`, async () => {
      const findings = await scanner.scan(testCase.input, 'test.ts');
      
      // Compare with expected findings
      expect(findings).toMatchSnapshot();
      
      // Or structured comparison
      expect(findings).toEqual(
        expect.arrayContaining(
          testCase.expectedFindings.map(f => expect.objectContaining(f))
        )
      );
    });
  }
});
```

### Snapshot Format
```json
{
  "findings": [
    {
      "id": "finding-abc123...",
      "ruleId": "ghost-route",
      "severity": "error",
      "filePath": "test.ts",
      "line": 2,
      "column": 30,
      "message": "GHOST ROUTE: /api/users/123 not found in truthpack",
      "confidence": 0.9,
      "evidence": {
        "found": false,
        "source": "truthpack"
      }
    }
  ],
  "stats": {
    "totalFindings": 1,
    "bySeverity": {
      "error": 1,
      "warning": 0,
      "info": 0
    }
  }
}
```

---

## Benchmark Harness

### Benchmark Structure
```typescript
interface Benchmark {
  name: string;
  repo: string;                   // Git repo URL or local path
  baseline: PerformanceBaseline;  // Previous performance metrics
}

interface PerformanceBaseline {
  scanTimeMs: number;
  memoryPeakMb: number;
  findingsCount: number;
  timestamp: string;
}

class BenchmarkHarness {
  async runBenchmark(benchmark: Benchmark): Promise<BenchmarkResult> {
    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed;
    
    const result = await scanner.scan(benchmark.repo);
    
    const endTime = Date.now();
    const endMemory = process.memoryUsage().heapUsed;
    
    return {
      scanTimeMs: endTime - startTime,
      memoryPeakMb: (endMemory - startMemory) / 1024 / 1024,
      findingsCount: result.findings.length,
      timestamp: new Date().toISOString(),
    };
  }
  
  async compareWithBaseline(
    result: BenchmarkResult,
    baseline: PerformanceBaseline
  ): Promise<ComparisonResult> {
    return {
      scanTimeDelta: result.scanTimeMs - baseline.scanTimeMs,
      scanTimeDeltaPercent: 
        ((result.scanTimeMs - baseline.scanTimeMs) / baseline.scanTimeMs) * 100,
      memoryDelta: result.memoryPeakMb - baseline.memoryPeakMb,
      findingsDelta: result.findingsCount - baseline.findingsCount,
      regression: result.scanTimeMs > baseline.scanTimeMs * 1.1, // 10% threshold
    };
  }
}
```

---

## Implementation Checklist

- [x] Document pipeline stages
- [ ] Implement deterministic finding IDs
- [ ] Implement stable ordering
- [ ] Implement rule registry
- [ ] Add confidence scoring
- [ ] Add parallelization with limits
- [ ] Add incremental scanning
- [ ] Add evidence receipts
- [ ] Add golden tests
- [ ] Add benchmark harness
- [ ] Add suppression mechanism
- [ ] Document plugin interface

---

## Migration Guide

### For Existing Scans
1. Re-run scans to generate new stable IDs
2. Map old IDs to new IDs using content hash
3. Update any references to old IDs

### For Rule Authors
1. Register rules in rule registry
2. Add test fixtures for each rule
3. Update rule IDs to be stable

### For Plugin Authors
1. Follow plugin interface contract
2. Avoid hidden global state
3. Register rules via plugin interface

---

## References

- [SARIF Specification](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html)
- [Rule Registry Pattern](https://martinfowler.com/articles/domain-oriented-observability.html)
- [Evidence-Based Security](https://www.usenix.org/conference/soups2018/presentation/pearce)
