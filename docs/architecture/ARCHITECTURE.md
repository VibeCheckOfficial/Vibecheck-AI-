# Architecture Overview

This document describes the high-level architecture of VibeCheck, a hallucination prevention system for AI-assisted development.

## Table of Contents

- [Design Philosophy](#design-philosophy)
- [System Overview](#system-overview)
- [Core Components](#core-components)
- [Data Flow](#data-flow)
- [Package Structure](#package-structure)
- [Key Abstractions](#key-abstractions)
- [Extension Points](#extension-points)
- [Security Model](#security-model)

## Design Philosophy

### Core Principles

1. **Local-First** — All processing happens on the user's machine. No code leaves their system.

2. **Non-Invasive** — VibeCheck observes and validates without modifying the development workflow.

3. **Incremental Adoption** — Start with observation mode, gradually increase strictness.

4. **Framework Agnostic** — Support multiple frameworks, languages, and tools.

5. **Composable** — Each component is independent and can be used standalone.

### Three-Level Defense

VibeCheck prevents hallucinations at three levels:

```
┌─────────────────────────────────────────────────────────────────┐
│ LEVEL 1: BEFORE GENERATION                                       │
│                                                                   │
│ • Inject verified context into AI prompts                        │
│ • Provide truthpack data (routes, types, env vars)               │
│ • Reduce hallucination probability at the source                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ LEVEL 2: DURING GENERATION                                       │
│                                                                   │
│ • Agent firewall intercepts write operations                     │
│ • Extract verifiable claims from generated code                  │
│ • Resolve evidence against truthpack                             │
│ • Apply policies to make allow/block decisions                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ LEVEL 3: AFTER GENERATION                                        │
│                                                                   │
│ • Validate saved files against truthpack                         │
│ • Detect drift between code and documentation                    │
│ • Provide actionable unblock plans                               │
│ • Maintain audit trail for traceability                          │
└─────────────────────────────────────────────────────────────────┘
```

## System Overview

```
                                  ┌─────────────────┐
                                  │   AI Assistant  │
                                  │ (Claude/Cursor) │
                                  └────────┬────────┘
                                           │
                                           │ MCP Protocol
                                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                        MCP Server                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  Truthpack  │  │  Firewall   │  │ Registration│              │
│  │   Tools     │  │   Tools     │  │    Tools    │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
└─────────┼────────────────┼────────────────┼─────────────────────┘
          │                │                │
          └────────────────┼────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                       @vibecheck/core                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  Truthpack  │  │  Firewall   │  │ Validation  │              │
│  │  Generator  │  │   Engine    │  │   Engine    │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Context   │  │   Prompt    │  │   Autofix   │              │
│  │   Manager   │  │   Builder   │  │   Engine    │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Local Filesystem                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Project   │  │ .vibecheck/ │  │   Audit     │              │
│  │    Code     │  │  truthpack  │  │    Logs     │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Truthpack System

The truthpack is a verified source of truth about the codebase.

```
packages/core/src/truthpack/
├── generator.ts          # Orchestrates truthpack generation
├── scanners/
│   ├── route-scanner.ts  # Extracts API routes
│   ├── env-scanner.ts    # Extracts environment variables
│   ├── auth-scanner.ts   # Extracts auth configuration
│   └── contract-scanner.ts # Extracts API contracts
├── schemas/
│   ├── routes.schema.ts  # Zod schema for routes
│   ├── env.schema.ts     # Zod schema for env vars
│   ├── auth.schema.ts    # Zod schema for auth
│   └── contracts.schema.ts # Zod schema for contracts
└── validators.ts         # Truthpack validation
```

**Key Classes:**

- `TruthpackGenerator` — Orchestrates scanning and file generation
- `RouteScanner` — Detects routes in Next.js, Express, Fastify, Hono
- `EnvScanner` — Finds `.env` files and `process.env` usage
- `AuthScanner` — Detects auth middleware, roles, protected resources
- `ContractScanner` — Extracts OpenAPI specs, Zod schemas, TS interfaces

### 2. Agent Firewall

The firewall intercepts and validates AI-generated code.

```
packages/core/src/firewall/
├── agent-firewall.ts     # Main orchestrator
├── intent-validator.ts   # Validates action intent
├── claim-extractor.ts    # Extracts verifiable claims
├── evidence-resolver.ts  # Resolves claims against truthpack
├── policy-engine.ts      # Applies validation policies
├── unblock-planner.ts    # Generates fix suggestions
└── rules/
    ├── ghost-route.ts    # Undefined API endpoint rule
    ├── ghost-env.ts      # Undefined env variable rule
    └── ghost-import.ts   # Uninstalled package rule
```

**Pipeline:**

```
Request → Intent Validation → Claim Extraction → Evidence Resolution
                                                        │
                                                        ▼
              Unblock Plan ← Policy Decision ← Policy Engine
```

**Key Classes:**

- `AgentFirewall` — Central orchestrator
- `ClaimExtractor` — AST-based claim extraction
- `EvidenceResolver` — Multi-source evidence resolution
- `PolicyEngine` — Rule evaluation and decision making
- `UnblockPlanner` — Actionable fix generation

### 3. Context Manager

Manages context injection for AI prompts.

```
packages/core/src/context/
├── advanced-context-manager.ts  # Multi-layer context management
├── context-layers.ts            # Context layer definitions
├── freshness-scorer.ts          # Context freshness scoring
└── embedding-service.ts         # Semantic search (optional)
```

**Context Layers (in priority order):**

1. **Truthpack** (critical) — Verified routes, types, env vars
2. **Codebase Structure** (high) — Project layout, key files
3. **Recent Changes** (medium) — Git history, modified files
4. **Conventions** (medium) — Coding standards, patterns
5. **Documentation** (low) — READMEs, comments
6. **Examples** (low) — Usage examples

### 4. Validation Engine

Detects hallucinations in generated code.

```
packages/core/src/validation/
├── hallucination-detector.ts  # Main detector
├── code-validator.ts          # Code-level validation
├── drift-detector.ts          # Truthpack drift detection
└── multi-source-verifier.ts   # Multi-source verification
```

**Detection Types:**

- Ghost routes (API endpoints that don't exist)
- Ghost imports (packages not in package.json)
- Ghost env vars (undeclared environment variables)
- Ghost types (undefined TypeScript types)

## Data Flow

### Truthpack Generation

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Source  │───▶│ Scanners │───▶│ Schemas  │───▶│  Output  │
│   Code   │    │          │    │  (Zod)   │    │   JSON   │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
     │                                               │
     │  routes.ts, api/*.ts                          │  .vibecheck/truthpack/
     │  .env, process.env                            │    ├── routes.json
     │  middleware, decorators                       │    ├── env.json
     │  openapi.yaml, schemas                        │    ├── auth.json
     │                                               │    └── contracts.json
```

### Firewall Evaluation

```
┌──────────────────────────────────────────────────────────────┐
│                    Firewall Request                           │
│  { action: 'write', target: 'api/users.ts', content: '...' } │
└─────────────────────────────┬────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Intent Validation                           │
│  Is this a valid write request? Is the target allowed?       │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Claim Extraction                            │
│  imports: ['express', 'zod']                                │
│  api_endpoints: ['/api/users/:id']                          │
│  env_variables: ['DATABASE_URL']                            │
│  type_references: ['UserDTO']                               │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Evidence Resolution                         │
│  express: ✅ found in package.json                          │
│  /api/users/:id: ❌ not in truthpack                        │
│  DATABASE_URL: ✅ found in .env                             │
│  UserDTO: ⚠️ not found (warning only)                       │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Policy Evaluation                           │
│  ghost-route: VIOLATION (error)                             │
│  ghost-import: PASS                                         │
│  ghost-env: PASS                                            │
│  ghost-type: VIOLATION (warning)                            │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Decision & Unblock Plan                     │
│  { allowed: false, violations: [...], unblockPlan: {...} }  │
└─────────────────────────────────────────────────────────────┘
```

## Package Structure

```
vibecheck/
├── packages/                    # Shared packages
│   ├── core/                    # Core library (the heart of VibeCheck)
│   │   ├── src/
│   │   │   ├── truthpack/       # Truthpack generation
│   │   │   ├── firewall/        # Agent firewall
│   │   │   ├── validation/      # Hallucination detection
│   │   │   ├── context/         # Context management
│   │   │   ├── prompt/          # Prompt building
│   │   │   ├── agents/          # Agent orchestration
│   │   │   └── autofix/         # Auto-fix suggestions
│   │   └── package.json
│   │
│   ├── mcp-server/              # MCP server for AI assistants
│   │   ├── src/
│   │   │   ├── tools/           # MCP tool definitions
│   │   │   ├── hooks/           # Pre/post generation hooks
│   │   │   └── middleware/      # Request middleware
│   │   └── package.json
│   │
│   ├── shared-types/            # Shared TypeScript types
│   └── shared-utils/            # Shared utilities
│
├── apps/                        # End-user applications
│   ├── cli/                     # Command-line interface
│   │   ├── src/
│   │   │   ├── commands/        # CLI commands
│   │   │   ├── ui/              # Ink/React UI components
│   │   │   └── lib/             # CLI utilities
│   │   └── package.json
│   │
│   └── vscode-extension/        # VS Code extension
│       ├── src/
│       └── package.json
│
└── docs/                        # Documentation
```

## Key Abstractions

### Claim

A verifiable assertion extracted from code:

```typescript
interface Claim {
  id: string;
  type: ClaimType;  // 'import' | 'api_endpoint' | 'env_variable' | ...
  value: string;    // The claimed value
  location: {
    line: number;
    column: number;
    length: number;
  };
  confidence: number;  // 0-1
  context: string;     // Surrounding code
}
```

### Evidence

Verification result for a claim:

```typescript
interface Evidence {
  claimId: string;
  found: boolean;
  source: 'truthpack' | 'filesystem' | 'package.json' | 'builtin';
  location?: string;   // Where it was found
  confidence: number;  // 0-1
  details?: unknown;   // Additional info
}
```

### Policy

A rule that evaluates claims and evidence:

```typescript
interface Policy {
  name: string;         // e.g., 'ghost-route'
  severity: 'error' | 'warning' | 'info';
  evaluate: (context: PolicyContext) => PolicyViolation | null;
}
```

### UnblockPlan

Actionable steps to fix violations:

```typescript
interface UnblockPlan {
  steps: UnblockStep[];
  estimatedEffort: 'trivial' | 'minor' | 'moderate' | 'significant';
  canAutoFix: boolean;
}

interface UnblockStep {
  order: number;
  action: 'verify' | 'add' | 'run' | 'modify';
  target: string;
  description: string;
  command?: string;
  autoFixable: boolean;
}
```

## Extension Points

### Custom Scanners

Add support for new frameworks:

```typescript
// packages/core/src/truthpack/scanners/my-scanner.ts
export class MyFrameworkScanner implements Scanner {
  async scan(projectRoot: string): Promise<RouteDefinition[]> {
    // Implement scanning logic
  }
}
```

### Custom Policies

Add new validation rules:

```typescript
// packages/core/src/firewall/rules/my-rule.ts
export const myRule: Policy = {
  name: 'my-custom-rule',
  severity: 'warning',
  evaluate: (ctx) => {
    // Return violation or null
  }
};
```

### Custom MCP Tools

Add new AI assistant capabilities:

```typescript
// packages/mcp-server/src/tools/my-tools.ts
export function registerMyTools(server: McpServer): void {
  server.tool('my_tool', 'Description', schema, handler);
}
```

## Security Model

### Threat Model

| Threat | Mitigation |
|--------|------------|
| Code exfiltration | All processing is local; no network calls |
| Secret exposure | Env values never stored; only names tracked |
| Malicious input | Input validation with Zod schemas |
| Path traversal | All paths canonicalized to project root |
| Dependency attacks | Regular audits; minimal dependencies |

### Trust Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│                    TRUSTED ZONE                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │   Project   │  │  Truthpack  │  │   Audit     │          │
│  │    Code     │  │    Data     │  │    Logs     │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
│                         │                                    │
│                    User's Machine                            │
└─────────────────────────────────────────────────────────────┘
                          │
                   Trust Boundary
                          │
┌─────────────────────────────────────────────────────────────┐
│                   UNTRUSTED ZONE                             │
│  ┌─────────────┐  ┌─────────────┐                           │
│  │ AI-Generated│  │   External  │                           │
│  │    Code     │  │   Network   │                           │
│  └─────────────┘  └─────────────┘                           │
└─────────────────────────────────────────────────────────────┘
```

### Audit Trail

All firewall decisions are logged:

```json
{
  "id": "audit-12345",
  "timestamp": "2024-01-15T10:30:00Z",
  "agentId": "claude-cursor",
  "action": "write",
  "target": "src/api/users.ts",
  "allowed": false,
  "violations": ["ghost-route"],
  "duration": 45
}
```

---

## Further Reading

- [Truthpack Specification](docs/truthpack-spec.md)
- [Agent Firewall Details](docs/agent-firewall.md)
- [Firewall Hooks](docs/agent-firewall-hooks.md)
- [Hallucination Reduction](docs/HALLUCINATION-REDUCTION.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to contribute to VibeCheck's architecture.

Questions? Open a [discussion](https://github.com/VibeCheckOfficial/Vibecheck-AI-/discussions) or email [founder@vibecheckai.dev](mailto:founder@vibecheckai.dev).
