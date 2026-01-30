# Agent Firewall Hooks

## Overview

Hooks allow you to intercept and modify agent behavior at specific lifecycle points. They provide fine-grained control over the code generation pipeline.

## Available Hooks

| Hook | Trigger | Capabilities |
|------|---------|--------------|
| `pre-generation` | Before AI generates code | Inject context, validate intent |
| `post-generation` | After AI generates code | Validate output, detect hallucinations |
| `file-write` | Before file is written | Final validation, audit logging |

## Pre-Generation Hook

Runs before code is generated to enhance the prompt and validate intent.

### Usage

```typescript
import { PreGenerationHook } from '@vibecheck/mcp-server';

const hook = new PreGenerationHook();

const result = await hook.execute({
  task: 'Add user authentication',
  targetFile: 'src/api/auth.ts',
  existingCode: currentFileContent,
});

if (result.proceed) {
  // Use result.injectedPrompt for enhanced context
  const enhancedPrompt = result.injectedPrompt + '\n' + originalPrompt;
}
```

### What It Does

1. **Loads Relevant Truthpack** - Determines which truthpack sections are needed based on the task
2. **Analyzes Task** - Checks for vague or dangerous operations
3. **Loads Conventions** - Includes project-specific coding conventions
4. **Generates Injected Prompt** - Creates a context section to prepend to the prompt

### Result

```typescript
interface PreGenerationResult {
  proceed: boolean;              // Whether to proceed with generation
  enhancedContext: Record<string, unknown>;  // Context data
  warnings: string[];            // Any warnings (BLOCK: prefix = hard stop)
  injectedPrompt?: string;       // Prompt section to inject
}
```

## Post-Generation Hook

Runs after code is generated to validate the output before it's used.

### Usage

```typescript
import { PostGenerationHook } from '@vibecheck/mcp-server';

const hook = new PostGenerationHook();

const result = await hook.execute({
  generatedCode: aiOutput,
  targetFile: 'src/api/auth.ts',
  originalTask: 'Add user authentication',
});

if (!result.approved) {
  console.log('Issues found:', result.issues);
  console.log('Suggestions:', result.suggestions);
}
```

### What It Does

1. **Hallucination Check** - Detects suspicious patterns that indicate hallucination
2. **Import Validation** - Verifies all imports can be resolved
3. **Convention Check** - Ensures code follows project conventions
4. **Security Scan** - Detects potential security issues

### Result

```typescript
interface PostGenerationResult {
  approved: boolean;             // Whether code passed validation
  code: string;                  // The code (unchanged)
  issues: ValidationIssue[];     // All issues found
  hallucinationScore: number;    // 0-1 score (lower is better)
  suggestions: string[];         // Fix suggestions
}
```

### Issue Types

```typescript
interface ValidationIssue {
  type: 'error' | 'warning' | 'info';
  category: 'hallucination' | 'convention' | 'security' | 'style';
  message: string;
  line?: number;
  suggestion?: string;
}
```

## File Write Hook

Final checkpoint before any file is written to disk.

### Usage

```typescript
import { FileWriteHook } from '@vibecheck/mcp-server';

const hook = new FileWriteHook();

const result = await hook.execute({
  filePath: 'src/api/auth.ts',
  content: newContent,
  action: 'modify',
  previousContent: oldContent,
});

if (!result.allowed) {
  console.log('Write blocked:', result.auditEntry);
}
```

### What It Does

1. **Analyzes Changes** - Determines what's being added/removed/modified
2. **Validates Changes** - Checks for dangerous patterns or credentials
3. **Creates Audit Entry** - Records the change for traceability
4. **Saves Audit** - Writes audit record to disk

### Result

```typescript
interface FileWriteResult {
  allowed: boolean;              // Whether write is allowed
  content: string;               // Content to write (or previous if blocked)
  changes: Change[];             // List of changes
  auditEntry: AuditEntry;        // Audit record
}
```

### Audit Entry

```typescript
interface AuditEntry {
  timestamp: Date;
  filePath: string;
  action: 'create' | 'modify' | 'delete';
  result: 'allowed' | 'blocked' | 'modified';
  hash: string;                  // Content hash
  changes: Change[];
}
```

## Hook Chain

Hooks are executed in sequence:

```
User Request
     │
     ▼
┌─────────────────────┐
│ Pre-Generation Hook │ → Enhance prompt, check intent
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   AI Generation     │ → Generate code
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│Post-Generation Hook │ → Validate output
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  File Write Hook    │ → Final validation & audit
└──────────┬──────────┘
           │
           ▼
      File Written
```

## Configuration

Hooks can be configured in `.vibecheck/config.json`:

```json
{
  "hooks": {
    "preGeneration": {
      "enabled": true,
      "injectTruthpack": true,
      "injectConventions": true,
      "blockVagueTasks": false
    },
    "postGeneration": {
      "enabled": true,
      "hallucinationThreshold": 0.3,
      "securityScanEnabled": true
    },
    "fileWrite": {
      "enabled": true,
      "auditEnabled": true,
      "blockCredentials": true
    }
  }
}
```

## Custom Hooks

Create custom hooks by extending the base classes:

```typescript
class CustomPreGenerationHook extends PreGenerationHook {
  async execute(context: PreGenerationContext): Promise<PreGenerationResult> {
    // Call parent implementation
    const result = await super.execute(context);
    
    // Add custom logic
    if (context.task.includes('database')) {
      result.enhancedContext.databaseSchema = await this.loadDatabaseSchema();
    }
    
    return result;
  }
}
```

## Best Practices

1. **Don't Block Unnecessarily** - Use warnings for minor issues, errors for serious problems
2. **Provide Helpful Suggestions** - Always include actionable fix suggestions
3. **Keep Hooks Fast** - Hooks run on every operation, so optimize for speed
4. **Log Everything** - Use audit logging for traceability
5. **Test Hooks Thoroughly** - Test with both valid and invalid inputs
