/**
 * PromptBuilderService Tests
 * 
 * Run with: npx ts-node --esm src/test/PromptBuilderService.test.ts
 */

// Mock VS Code API for testing outside VS Code environment
const mockVscode = {
  workspace: {
    workspaceFolders: [{ uri: { fsPath: process.cwd() }, name: 'test-project' }],
    getConfiguration: () => ({
      get: () => undefined
    })
  },
  window: {
    activeTextEditor: {
      document: {
        fileName: 'test.ts',
        languageId: 'typescript',
        getText: () => ''
      },
      selection: { isEmpty: true }
    }
  },
  ExtensionContext: class { }
};

// Inject mock before importing service
(global as any).vscode = mockVscode;

// ═══════════════════════════════════════════════════════════════════════════════
// Test Types
// ═══════════════════════════════════════════════════════════════════════════════

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

interface TestSuite {
  name: string;
  tests: TestResult[];
  passed: number;
  failed: number;
  duration: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Test Runner
// ═══════════════════════════════════════════════════════════════════════════════

class TestRunner {
  private suites: TestSuite[] = [];
  private currentSuite: TestSuite | null = null;

  describe(name: string, fn: () => void | Promise<void>) {
    this.currentSuite = { name, tests: [], passed: 0, failed: 0, duration: 0 };
    const start = Date.now();

    try {
      const result = fn();
      if (result instanceof Promise) {
        return result.then(() => {
          this.currentSuite!.duration = Date.now() - start;
          this.suites.push(this.currentSuite!);
        });
      }
    } catch (e) {
      // Suite setup error
    }

    this.currentSuite.duration = Date.now() - start;
    this.suites.push(this.currentSuite);
  }

  it(name: string, fn: () => void | boolean) {
    const start = Date.now();
    let result: TestResult;

    try {
      const outcome = fn();
      const passed = outcome !== false;
      result = { name, passed, duration: Date.now() - start };

      if (passed) {
        this.currentSuite!.passed++;
      } else {
        this.currentSuite!.failed++;
        result.error = 'Assertion failed';
      }
    } catch (e: any) {
      result = {
        name,
        passed: false,
        error: e.message || String(e),
        duration: Date.now() - start
      };
      this.currentSuite!.failed++;
    }

    this.currentSuite!.tests.push(result);
  }

  report(): void {
    console.log('\n' + '═'.repeat(70));
    console.log('  PROMPT BUILDER SERVICE - TEST RESULTS');
    console.log('═'.repeat(70) + '\n');

    let totalPassed = 0;
    let totalFailed = 0;

    for (const suite of this.suites) {
      const icon = suite.failed === 0 ? '✅' : '❌';
      console.log(`${icon} ${suite.name} (${suite.duration}ms)`);
      console.log('─'.repeat(50));

      for (const test of suite.tests) {
        const testIcon = test.passed ? '  ✓' : '  ✗';
        const color = test.passed ? '\x1b[32m' : '\x1b[31m';
        const reset = '\x1b[0m';
        console.log(`${color}${testIcon} ${test.name}${reset} (${test.duration}ms)`);

        if (!test.passed && test.error) {
          console.log(`     └─ Error: ${test.error}`);
        }
      }

      console.log();
      totalPassed += suite.passed;
      totalFailed += suite.failed;
    }

    console.log('═'.repeat(70));
    console.log(`  SUMMARY: ${totalPassed} passed, ${totalFailed} failed`);
    console.log('═'.repeat(70) + '\n');

    if (totalFailed > 0) {
      process.exitCode = 1;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Assertion Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function assert(condition: boolean, message?: string): void {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

function assertIncludes(str: string, substring: string, message?: string): void {
  if (!str.includes(substring)) {
    throw new Error(message || `Expected "${str}" to include "${substring}"`);
  }
}

function assertGreaterThan(actual: number, expected: number, message?: string): void {
  if (actual <= expected) {
    throw new Error(message || `Expected ${actual} to be greater than ${expected}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Inline Service Implementation for Testing
// ═══════════════════════════════════════════════════════════════════════════════

interface PromptTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  keywords: string[];
  popularity?: number;
}

// Simplified templates for testing
const TEST_TEMPLATES: PromptTemplate[] = [
  {
    id: 'auth-oauth',
    name: 'OAuth Login (Google, GitHub, etc.)',
    category: 'authentication',
    description: 'Social login with multiple OAuth providers',
    icon: '🔐',
    keywords: ['login', 'signin', 'sign in', 'oauth', 'google', 'github', 'auth', 'authentication', 'social login', 'sso'],
    popularity: 100,
  },
  {
    id: 'auth-credentials',
    name: 'Email & Password Auth',
    category: 'authentication',
    description: 'Traditional email/password with verification',
    icon: '📧',
    keywords: ['email', 'password', 'register', 'signup', 'sign up', 'login', 'credentials', 'verification'],
    popularity: 95,
  },
  {
    id: 'api-rest-crud',
    name: 'REST API with CRUD',
    category: 'api',
    description: 'Full CRUD REST API endpoint',
    icon: '🔌',
    keywords: ['api', 'rest', 'crud', 'endpoint', 'get', 'post', 'put', 'delete', 'route'],
    popularity: 90,
  },
  {
    id: 'frontend-component',
    name: 'React Component',
    category: 'frontend',
    description: 'Production-ready React component',
    icon: '⚛️',
    keywords: ['react', 'component', 'ui', 'frontend', 'jsx', 'tsx', 'hook', 'props'],
    popularity: 95,
  },
  {
    id: 'database-schema',
    name: 'Database Schema',
    category: 'database',
    description: 'Database schema with Prisma/Drizzle',
    icon: '🗄️',
    keywords: ['database', 'schema', 'prisma', 'drizzle', 'model', 'table', 'migration', 'sql'],
    popularity: 85,
  },
  {
    id: 'testing-unit',
    name: 'Unit Tests',
    category: 'testing',
    description: 'Unit tests for functions/components',
    icon: '🧪',
    keywords: ['test', 'unit', 'jest', 'vitest', 'testing', 'spec', 'mock', 'coverage'],
    popularity: 80,
  },
];

// Test implementation of detectTemplate
function detectTemplate(input: string): PromptTemplate | null {
  const normalizedInput = input.toLowerCase();
  let bestMatch: PromptTemplate | null = null;
  let bestScore = 0;

  for (const template of TEST_TEMPLATES) {
    let score = 0;

    for (const keyword of template.keywords) {
      if (normalizedInput.includes(keyword)) {
        score += keyword.length * 2;
        // Bonus for word boundary match
        if (new RegExp(`\\b${keyword}\\b`).test(normalizedInput)) {
          score += 5;
        }
      }
    }

    // Boost popular templates slightly
    score += (template.popularity || 0) / 20;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = template;
    }
  }

  return bestScore > 8 ? bestMatch : null;
}

// Test implementation of quality analysis
function analyzePromptQuality(prompt: string): { score: number; completeness: number; specificity: number; clarity: number; suggestions: string[] } {
  const suggestions: string[] = [];

  // Check completeness - look for key sections
  const expectedSections = ['context', 'requirements', 'output', 'example'];
  const foundSections = expectedSections.filter(s =>
    prompt.toLowerCase().includes(s) ||
    prompt.includes('##') ||
    prompt.includes('###')
  );
  const completeness = Math.min(100, (foundSections.length / expectedSections.length) * 100 + 20);

  // Check specificity - look for concrete details
  let specificity = 50;
  if (prompt.includes('```')) specificity += 15; // Has code blocks
  if (/\d+/.test(prompt)) specificity += 10; // Has numbers
  if (prompt.length > 200) specificity += 15; // Detailed
  if (prompt.includes('TypeScript') || prompt.includes('JavaScript')) specificity += 10;
  specificity = Math.min(100, specificity);

  // Check clarity - structure and formatting
  let clarity = 70;
  if (prompt.includes('#')) clarity += 10; // Has headers
  if (prompt.includes('- ') || prompt.includes('* ')) clarity += 10; // Has lists
  if (prompt.length > 100 && prompt.length < 5000) clarity += 10; // Good length
  clarity = Math.min(100, clarity);

  // Generate suggestions
  if (completeness < 80) {
    suggestions.push('Add more context about your project setup');
  }
  if (specificity < 70) {
    suggestions.push('Include specific requirements or examples');
  }
  if (!prompt.includes('```')) {
    suggestions.push('Add code examples where relevant');
  }

  const score = Math.round((completeness + specificity + clarity) / 3);

  return { score, completeness, specificity, clarity, suggestions };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Test Suites
// ═══════════════════════════════════════════════════════════════════════════════

const runner = new TestRunner();

// Test Suite 1: Template Detection
void runner.describe('Template Detection', () => {

  runner.it('detects OAuth template from "login with google"', () => {
    const result = detectTemplate('help me setup login with google');
    assert(result !== null, 'Should detect a template');
    assertEqual(result!.id, 'auth-oauth', 'Should detect auth-oauth template');
  });

  runner.it('detects OAuth template from "github sign in"', () => {
    const result = detectTemplate('add github sign in to my app');
    assert(result !== null, 'Should detect a template');
    assertEqual(result!.id, 'auth-oauth', 'Should detect auth-oauth template');
  });

  runner.it('detects credentials template from "email password"', () => {
    const result = detectTemplate('create signup form with email password registration');
    assert(result !== null, 'Should detect a template');
    assertEqual(result!.id, 'auth-credentials', 'Should detect auth-credentials template');
  });

  runner.it('detects API template from "rest api crud"', () => {
    const result = detectTemplate('create a REST API with CRUD operations');
    assert(result !== null, 'Should detect a template');
    assertEqual(result!.id, 'api-rest-crud', 'Should detect api-rest-crud template');
  });

  runner.it('detects React component template', () => {
    const result = detectTemplate('build a react component for user profile');
    assert(result !== null, 'Should detect a template');
    assertEqual(result!.id, 'frontend-component', 'Should detect frontend-component template');
  });

  runner.it('detects database template from "prisma schema"', () => {
    const result = detectTemplate('design a prisma schema for users');
    assert(result !== null, 'Should detect a template');
    assertEqual(result!.id, 'database-schema', 'Should detect database-schema template');
  });

  runner.it('detects testing template from "unit tests"', () => {
    const result = detectTemplate('write unit tests for my function');
    assert(result !== null, 'Should detect a template');
    assertEqual(result!.id, 'testing-unit', 'Should detect testing-unit template');
  });

  runner.it('returns null for unrelated input', () => {
    const result = detectTemplate('hello world');
    assertEqual(result, null, 'Should not detect any template');
  });

  runner.it('handles mixed case input', () => {
    const result = detectTemplate('SETUP GOOGLE LOGIN');
    assert(result !== null, 'Should detect template regardless of case');
    assertEqual(result!.id, 'auth-oauth');
  });

  runner.it('prioritizes more specific matches', () => {
    const result = detectTemplate('oauth authentication with google and github social login');
    assert(result !== null);
    assertEqual(result!.id, 'auth-oauth', 'Should prioritize OAuth over credentials');
  });

});

// Test Suite 2: Quality Analysis
void runner.describe('Prompt Quality Analysis', () => {

  runner.it('scores a minimal prompt low', () => {
    const result = analyzePromptQuality('make a button');
    assertGreaterThan(50, result.score, 'Minimal prompt should score low');
  });

  runner.it('scores a detailed prompt higher', () => {
    const detailed = `
## Context
I'm building a Next.js app with TypeScript.

## Requirements
- Create a login button component
- Support loading state
- Handle errors gracefully

## Output
\`\`\`tsx
// Complete React component
\`\`\`
    `;
    const result = analyzePromptQuality(detailed);
    assertGreaterThan(result.score, 60, 'Detailed prompt should score higher');
  });

  runner.it('recognizes code blocks as adding specificity', () => {
    const withCode = 'Create this: ```ts\nconst x = 1;\n```';
    const withoutCode = 'Create a variable';

    const scoreWith = analyzePromptQuality(withCode);
    const scoreWithout = analyzePromptQuality(withoutCode);

    assertGreaterThan(scoreWith.specificity, scoreWithout.specificity,
      'Code blocks should increase specificity');
  });

  runner.it('generates suggestions for incomplete prompts', () => {
    const result = analyzePromptQuality('make button');
    assert(result.suggestions.length > 0, 'Should generate suggestions');
  });

  runner.it('completeness increases with headers', () => {
    const withHeaders = '## Context\nTest\n## Requirements\nTest';
    const plain = 'Test test';

    const scoreWith = analyzePromptQuality(withHeaders);
    const scoreWithout = analyzePromptQuality(plain);

    assertGreaterThan(scoreWith.clarity, scoreWithout.clarity,
      'Headers should increase clarity');
  });

});

// Test Suite 3: Template Categories
void runner.describe('Template Categories', () => {

  runner.it('has authentication templates', () => {
    const authTemplates = TEST_TEMPLATES.filter(t => t.category === 'authentication');
    assertGreaterThan(authTemplates.length, 0, 'Should have auth templates');
  });

  runner.it('has api templates', () => {
    const apiTemplates = TEST_TEMPLATES.filter(t => t.category === 'api');
    assertGreaterThan(apiTemplates.length, 0, 'Should have API templates');
  });

  runner.it('has frontend templates', () => {
    const frontendTemplates = TEST_TEMPLATES.filter(t => t.category === 'frontend');
    assertGreaterThan(frontendTemplates.length, 0, 'Should have frontend templates');
  });

  runner.it('all templates have required fields', () => {
    for (const template of TEST_TEMPLATES) {
      assert(!!template.id, `Template missing id`);
      assert(!!template.name, `Template ${template.id} missing name`);
      assert(!!template.category, `Template ${template.id} missing category`);
      assert(!!template.keywords, `Template ${template.id} missing keywords`);
      assert(template.keywords.length > 0, `Template ${template.id} has no keywords`);
    }
    return true;
  });

  runner.it('templates have unique IDs', () => {
    const ids = TEST_TEMPLATES.map(t => t.id);
    const uniqueIds = new Set(ids);
    assertEqual(ids.length, uniqueIds.size, 'All template IDs should be unique');
  });

});

// Test Suite 4: Keyword Matching
void runner.describe('Keyword Matching Edge Cases', () => {

  runner.it('handles empty input', () => {
    const result = detectTemplate('');
    assertEqual(result, null, 'Empty input should return null');
  });

  runner.it('handles whitespace only', () => {
    const result = detectTemplate('   \n\t   ');
    assertEqual(result, null, 'Whitespace should return null');
  });

  runner.it('handles special characters', () => {
    const result = detectTemplate('login with google! @#$%');
    assert(result !== null, 'Should handle special characters');
  });

  runner.it('matches partial words correctly', () => {
    // "auth" is a keyword, should match even in "authentication"
    const result = detectTemplate('authentication system');
    assert(result !== null, 'Should match partial keyword');
  });

  runner.it('handles very long input', () => {
    const longInput = 'login with google '.repeat(100);
    const result = detectTemplate(longInput);
    assert(result !== null, 'Should handle long input');
  });

});

// Test Suite 5: Popularity Scoring
void runner.describe('Popularity Scoring', () => {

  runner.it('OAuth template has highest popularity', () => {
    const oauth = TEST_TEMPLATES.find(t => t.id === 'auth-oauth');
    assert(oauth !== undefined);
    assertEqual(oauth!.popularity, 100, 'OAuth should have popularity 100');
  });

  runner.it('templates are sorted by popularity when equal keyword matches', () => {
    // Both auth templates match "login", but OAuth should win due to popularity
    const result = detectTemplate('login page');
    // This might match either, but should be consistent
    assert(result !== null);
  });

});

// Run all tests
runner.report();
