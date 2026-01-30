# Contributing to VibeCheck

First off, thank you for considering contributing to VibeCheck! It's people like you that make VibeCheck such a great tool for developers everywhere.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Commit Messages](#commit-messages)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)
- [Community](#community)

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to [support@vibecheckai.dev](mailto:support@vibecheckai.dev).

## Getting Started

### Types of Contributions

We welcome many types of contributions:

- 🐛 **Bug fixes** — Found something broken? Fix it!
- ✨ **New features** — Have an idea? Implement it!
- 📖 **Documentation** — Improve guides, fix typos, add examples
- 🧪 **Tests** — Increase coverage, add edge cases
- 🎨 **Design** — UI/UX improvements for CLI and VS Code extension
- 🌍 **Translations** — Help make VibeCheck accessible globally

### Before You Start

1. **Check existing issues** — Someone might already be working on it
2. **Open an issue first** — For significant changes, discuss before coding
3. **Fork the repository** — Work on your own copy

## Development Setup

### Prerequisites

- **Node.js** >= 18.0.0
- **pnpm** >= 9.0.0
- **Git**
- **VS Code** (recommended)

### Installation

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/vibecheck.git
cd vibecheck

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests to verify setup
pnpm test
```

### Running in Development

```bash
# Start all packages in watch mode
pnpm dev

# Run specific package
pnpm --filter @vibecheck/core dev
pnpm --filter @vibecheck/cli dev

# Run the CLI locally
pnpm --filter @vibecheck/cli start

# Run the MCP server locally
pnpm --filter @vibecheck/mcp-server start
```

### VS Code Extension Development

```bash
# Compile the extension
pnpm --filter vibecheck-extension compile

# Open VS Code with extension loaded
# Press F5 in VS Code with the extension folder open
```

## Project Structure

```
vibecheck/
├── packages/
│   ├── core/                 # Core library
│   │   ├── src/
│   │   │   ├── truthpack/    # Truthpack scanners & generation
│   │   │   ├── firewall/     # Agent firewall components
│   │   │   ├── validation/   # Hallucination detection
│   │   │   ├── context/      # Context management
│   │   │   ├── prompt/       # Prompt building
│   │   │   └── agents/       # Agent orchestration
│   │   └── tests/
│   ├── mcp-server/           # MCP server implementation
│   │   ├── src/
│   │   │   ├── tools/        # MCP tool definitions
│   │   │   └── hooks/        # Generation hooks
│   │   └── tests/
│   ├── shared-types/         # Shared TypeScript types
│   └── shared-utils/         # Shared utilities
├── apps/
│   ├── cli/                  # CLI application
│   │   ├── src/
│   │   │   ├── commands/     # CLI commands
│   │   │   ├── ui/           # Ink/React UI components
│   │   │   └── lib/          # CLI utilities
│   │   └── tests/
│   └── vscode-extension/     # VS Code extension
│       └── src/
├── docs/                     # Documentation
└── .github/                  # GitHub workflows & templates
```

## Making Changes

### Branch Naming

Use descriptive branch names:

```
feature/add-fastify-scanner
fix/ghost-route-false-positive
docs/update-readme-examples
chore/upgrade-typescript
```

### Development Workflow

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/your-feature
   ```

2. **Make your changes** with clear, atomic commits

3. **Run checks** before pushing:
   ```bash
   pnpm check-types    # TypeScript type checking
   pnpm lint           # ESLint
   pnpm test           # Unit tests
   ```

4. **Push your branch** and open a pull request

## Coding Standards

### TypeScript

- Use **strict mode** (`"strict": true`)
- **No `any`** — use `unknown` when type is uncertain
- **Explicit return types** for exported functions
- **Named exports** only — no default exports

```typescript
// ✅ Good
export const fetchUser = async (id: string): Promise<User> => {
  return await db.users.findById(id);
};

// ❌ Bad
export default async function(id: any) {
  return await db.users.findById(id);
}
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `route-scanner.ts` |
| Types/Interfaces | PascalCase | `RouteDefinition` |
| Functions/Variables | camelCase | `scanRoutes` |
| Constants | SCREAMING_SNAKE | `MAX_CLAIMS` |
| Booleans | is/has/can prefix | `isValid`, `hasAuth` |

### Code Organization

```typescript
// 1. External imports
import * as fs from 'fs/promises';
import { z } from 'zod';

// 2. Internal workspace imports
import type { RouteDefinition } from '@vibecheck/shared-types';

// 3. Relative imports
import { scanFile } from './utils.js';

// 4. Type-only imports last
import type { ScanOptions } from './types.js';
```

### Documentation

- **JSDoc comments** for all exported functions
- **Inline comments** for complex logic
- **README** in each package explaining its purpose

```typescript
/**
 * Scans the codebase for API route definitions.
 * 
 * @param projectRoot - Root directory to scan
 * @param options - Scan configuration options
 * @returns Array of discovered route definitions
 * 
 * @example
 * ```typescript
 * const routes = await scanRoutes('/path/to/project', {
 *   frameworks: ['nextjs', 'express']
 * });
 * ```
 */
export async function scanRoutes(
  projectRoot: string,
  options?: ScanOptions
): Promise<RouteDefinition[]> {
  // Implementation
}
```

## Testing

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm --filter @vibecheck/core test

# Run tests in watch mode
pnpm --filter @vibecheck/core test -- --watch

# Run tests with coverage
pnpm --filter @vibecheck/core test -- --coverage
```

### Writing Tests

We use **Vitest** for testing. Follow these guidelines:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { RouteScanner } from '../src/truthpack/scanners/route-scanner';

describe('RouteScanner', () => {
  let scanner: RouteScanner;

  beforeEach(() => {
    scanner = new RouteScanner('/test/project');
  });

  describe('scan()', () => {
    it('should detect Next.js App Router routes', async () => {
      const routes = await scanner.scan();
      
      expect(routes).toContainEqual(
        expect.objectContaining({
          path: '/api/users',
          method: 'GET',
        })
      );
    });

    it('should handle empty projects gracefully', async () => {
      const routes = await scanner.scan();
      
      expect(routes).toEqual([]);
    });
  });
});
```

### Test Coverage Requirements

- **New features** must include tests
- **Bug fixes** should include regression tests
- Aim for **80%+ coverage** on critical paths

## Pull Request Process

### Before Opening a PR

- [ ] Code compiles without errors (`pnpm build`)
- [ ] All tests pass (`pnpm test`)
- [ ] Linting passes (`pnpm lint`)
- [ ] Type checking passes (`pnpm check-types`)
- [ ] Documentation is updated if needed

### PR Title Format

Use conventional commit format:

```
feat(core): add Fastify route scanner
fix(cli): handle missing config file gracefully
docs: update installation instructions
chore(deps): upgrade TypeScript to 5.4
```

### PR Description Template

```markdown
## Description
Brief description of changes.

## Type of Change
- [ ] Bug fix (non-breaking change fixing an issue)
- [ ] New feature (non-breaking change adding functionality)
- [ ] Breaking change (fix or feature causing existing functionality to change)
- [ ] Documentation update

## How Has This Been Tested?
Describe the tests you ran.

## Checklist
- [ ] My code follows the project style guidelines
- [ ] I have performed a self-review
- [ ] I have commented my code where necessary
- [ ] I have updated the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix/feature works
- [ ] New and existing unit tests pass locally
```

### Review Process

1. **Automated checks** must pass
2. **At least one maintainer** must approve
3. **All conversations** must be resolved
4. Maintainer will **squash and merge**

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, no code change |
| `refactor` | Code change, no feature/fix |
| `perf` | Performance improvement |
| `test` | Adding/fixing tests |
| `chore` | Build process, dependencies |

### Examples

```
feat(firewall): add support for custom policies

fix(scanner): handle symlinks in route detection

docs(readme): add MCP configuration example

chore(deps): upgrade @babel/parser to 7.24.0
```

## Reporting Bugs

### Before Reporting

1. **Search existing issues** — it might already be reported
2. **Try the latest version** — it might be fixed
3. **Gather information** — we need details to help

### Bug Report Template

```markdown
**Describe the bug**
Clear description of what the bug is.

**To Reproduce**
Steps to reproduce:
1. Run `vibecheck scan`
2. Add file `src/api/users.ts`
3. Run `vibecheck check src/api/users.ts`
4. See error

**Expected behavior**
What you expected to happen.

**Actual behavior**
What actually happened.

**Environment**
- OS: [e.g., macOS 14.2]
- Node.js: [e.g., 20.10.0]
- VibeCheck: [e.g., 1.0.0]
- Package manager: [e.g., pnpm 9.0.0]

**Additional context**
Any other context, screenshots, logs.
```

## Suggesting Features

### Feature Request Template

```markdown
**Is your feature request related to a problem?**
Clear description of the problem. Ex. "I'm always frustrated when..."

**Describe the solution you'd like**
Clear description of what you want to happen.

**Describe alternatives you've considered**
Other solutions or features you've considered.

**Additional context**
Any other context, mockups, examples.
```

## Community

### Getting Help

- 💬 [Discord](https://vibecheckai.dev/discord) — Chat with the community
- 🗣️ [Discussions](https://github.com/vibecheckai/vibecheck/discussions) — Ask questions
- 📧 [Email](mailto:support@vibecheckai.dev) — Reach the team directly

### Recognition

Contributors are recognized in:
- The project README
- Our [Contributors page](https://vibecheckai.dev/contributors)
- Release notes

---

Thank you for contributing to VibeCheck! 🎉

Every contribution, no matter how small, makes a difference. We appreciate you taking the time to help improve this project.
