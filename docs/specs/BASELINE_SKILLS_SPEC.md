# Baseline Skills Specification

## Overview

Baseline Skills are pre-packaged software engineering best practices that Forge uses as **default guidance** until it learns project-specific conventions. They solve the "cold start" problem where Forge has no context about a new codebase.

## Problem Statement

When Forge initializes on a new project:
1. No learned patterns exist yet
2. `conventions.json` is minimal or empty
3. No historical decisions or lessons in memory
4. AI has no project-specific guidance

**Result**: AI generates code based on generic knowledge, missing project conventions.

## Solution: Baseline Skills

Baseline skills provide **universal best practices** that:
- Apply to virtually any codebase
- Don't conflict with project-specific patterns
- Get overridden as Forge learns the project
- Remain as complementary guidance for universal principles

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Forge Rule Generation                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer 1: Project Conventions (Highest Priority)                │
│  - Learned from codebase analysis                               │
│  - Extracted from .vibecheck/knowledge/                         │
│  - User-defined rules                                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer 2: Baseline Skills (Fallback)                            │
│  - .cursor/skills/solid/                                        │
│  - Universal principles (SOLID, TDD, Clean Code)                │
│  - Active when conventions don't cover the topic                │
└─────────────────────────────────────────────────────────────────┘
```

## Configuration

In `.vibecheck/config.json`:

```json
{
  "forge": {
    "baselineSkills": {
      "enabled": true,
      "skills": ["solid"],
      "overrideByConventions": true,
      "description": "Universal best practices until Forge learns project conventions"
    }
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable baseline skills |
| `skills` | string[] | `["solid"]` | Which baseline skills to load |
| `overrideByConventions` | boolean | `true` | Let learned conventions take precedence |

## Included Skills

### `solid` - Professional Software Engineering

**Location**: `.cursor/skills/solid/`

**Contents**:
- SOLID principles (SRP, OCP, LSP, ISP, DIP)
- Test-Driven Development (TDD)
- Clean Code practices
- Design Patterns
- Code Smell detection
- Architecture principles
- Complexity management

**Reference Documents**:
- `references/solid-principles.md`
- `references/tdd.md`
- `references/testing.md`
- `references/clean-code.md`
- `references/code-smells.md`
- `references/design-patterns.md`
- `references/architecture.md`
- `references/object-design.md`
- `references/complexity.md`

## Priority Rules

1. **Project conventions override baseline skills** when both address the same topic
2. **Baseline skills fill gaps** where no convention exists
3. **Both can coexist** when they're complementary (e.g., project naming + SOLID principles)

### Example: Override Behavior

```
Project Convention: "Use functional programming style, avoid classes"
Baseline Skill: "Use classes with single responsibility"

Result: Project convention wins - Forge guides toward functional style
        BUT: SOLID principles still apply at function/module level
```

## Phase-Aware Behavior

Baseline skills can be more or less active based on project phase:

| Phase | Baseline Skill Activity |
|-------|------------------------|
| `prototyping` | Active - provides structure for new code |
| `active_development` | Active - guides feature implementation |
| `refactoring` | Highly Active - SOLID/Clean Code critical |
| `maintenance` | Lower priority - follow existing patterns |

## Future Skills

Additional baseline skill packs could include:

- `security` - OWASP, secure coding practices
- `performance` - Optimization patterns, caching strategies
- `accessibility` - WCAG guidelines, a11y best practices
- `api-design` - REST/GraphQL conventions, versioning
- `testing-advanced` - E2E, property-based, mutation testing

## Integration with Forge Memory

As Forge learns:

1. **Records lessons** from code reviews and decisions
2. **Builds patterns** from observed conventions
3. **Reduces baseline reliance** as project patterns emerge
4. **Keeps baseline for gaps** in learned knowledge

```
Day 1:   [████████████] Baseline Skills Active
Week 1:  [████████░░░░] Learning project patterns
Month 1: [████░░░░░░░░] Project conventions dominate
         └── Baseline still fills gaps
```

## Implementation Notes

### For Forge Rule Generator

```typescript
interface ForgeRuleSource {
  type: 'convention' | 'baseline' | 'user';
  priority: number; // convention: 100, baseline: 50, user: 200
  source: string;
}

// When generating rules, merge with priority
function generateRules(config: ForgeConfig): Rule[] {
  const conventions = loadConventions(); // priority: 100
  const baseline = loadBaselineSkills(); // priority: 50
  
  return mergeWithPriority(conventions, baseline);
}
```

### For Skill Loading

Skills follow the [Cursor Agent Skills](https://github.com/anthropics/agent-skills) format:
- `SKILL.md` - Main skill instructions
- `references/` - Supporting documentation

Forge reads skills from:
1. `.cursor/skills/` (project-level)
2. `~/.cursor/skills/` (user-level, if exists)

## Disabling Baseline Skills

Teams that don't want baseline skills can disable them:

```json
{
  "forge": {
    "baselineSkills": {
      "enabled": false
    }
  }
}
```

Or remove specific skills:

```json
{
  "forge": {
    "baselineSkills": {
      "enabled": true,
      "skills": []  // Empty = no baseline
    }
  }
}
```

## Summary

Baseline Skills provide:
- ✅ Immediate value on new projects
- ✅ Universal best practices (SOLID, TDD, Clean Code)
- ✅ Graceful override by project conventions
- ✅ Complementary guidance for gaps in learned knowledge
- ✅ Configurable per-project

They solve Forge's cold-start problem while respecting project-specific conventions as they emerge.
