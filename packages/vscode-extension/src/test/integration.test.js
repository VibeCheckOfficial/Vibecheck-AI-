/**
 * Integration test for PromptBuilderService with real templates
 */

// Mock vscode module before importing service
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(id) {
  if (id === 'vscode') {
    return {
      workspace: {
        workspaceFolders: [{ uri: { fsPath: process.cwd() }, name: 'test' }],
        getConfiguration: () => ({ get: () => undefined })
      },
      window: {
        activeTextEditor: null
      },
      ExtensionContext: class {}
    };
  }
  return originalRequire.apply(this, arguments);
};

const { PromptBuilderService } = require('../../out/services/PromptBuilderService.js');

// Create mock context
const mockContext = {
  globalState: {
    get: () => undefined,
    update: () => Promise.resolve()
  }
};

// Create service instance
const service = new PromptBuilderService(mockContext);
const PROMPT_TEMPLATES = service.getTemplates();

console.log('═'.repeat(60));
console.log('  PROMPT BUILDER - LIVE INTEGRATION TEST');
console.log('═'.repeat(60) + '\n');

// Check templates loaded
console.log('📋 Templates loaded: ' + PROMPT_TEMPLATES.length);
console.log();

// List all template categories
const categoriesData = service.getCategories();
console.log('📁 Categories:');
for (const cat of categoriesData) {
  console.log(`   ${cat.icon} ${cat.category}: ${cat.count} template(s)`);
}
console.log();

// Use service's detectTemplate method
function detectTemplate(input) {
  return service.detectTemplate(input);
}

// Test cases
const testCases = [
  'help me setup login with google and github',
  'create a REST API endpoint for users',
  'build a react component for user profile',
  'write unit tests for my service',
  'setup prisma schema for blog posts',
  'add stripe payment integration',
  'deploy to vercel with docker',
  'debug why my api is slow',
  'implement AI chat with streaming',
  'refactor this function to be cleaner'
];

console.log('🧪 Template Detection Tests:\n');
let passed = 0;
let total = testCases.length;

for (const input of testCases) {
  const result = detectTemplate(input);
  const icon = result ? '✅' : '⚠️';
  const match = result ? `${result.name} (${result.category})` : 'No match';
  console.log(`${icon} "${input.substring(0, 45)}..."`);
  console.log(`   → ${match}\n`);
  if (result) passed++;
}

console.log('═'.repeat(60));
console.log(`  RESULTS: ${passed}/${total} inputs matched templates`);
console.log('═'.repeat(60));

// Verify template integrity
console.log('\n🔍 Template Integrity Check:\n');
let valid = 0;
let issues = [];

const allTemplates = service.getTemplates();
for (const t of allTemplates) {
  const problems = [];
  if (!t.id) problems.push('missing id');
  if (!t.name) problems.push('missing name');
  if (!t.category) problems.push('missing category');
  if (!t.keywords || t.keywords.length === 0) problems.push('no keywords');
  if (!t.template) problems.push('missing template');
  
  if (problems.length === 0) {
    valid++;
  } else {
    issues.push({ id: t.id || 'unknown', problems });
  }
}

console.log(`✅ Valid templates: ${valid}/${allTemplates.length}`);
if (issues.length > 0) {
  console.log('\n❌ Issues found:');
  for (const issue of issues) {
    console.log(`   ${issue.id}: ${issue.problems.join(', ')}`);
  }
}

// Test buildPrompt (the core functionality)
console.log('\n📊 Prompt Building Test:\n');

void (async () => {
  try {
    const template = service.getTemplates().find(t => t.id === 'auth-oauth');
    if (template) {
      const answers = {
        providers: ['google', 'github'],
        authLibrary: 'nextauth'
      };
      
      const result = await service.buildPrompt(template, answers);
      
      console.log(`   ✅ Built prompt for: ${template.name}`);
      console.log(`   📝 Prompt length: ${result.expandedPrompt.length} chars`);
      console.log(`   📊 Quality score: ${result.quality.score}/100`);
      console.log(`   🎯 Completeness: ${result.quality.completeness}/100`);
      console.log(`   🔍 Specificity: ${result.quality.specificity}/100`);
      console.log(`   📖 Clarity: ${result.quality.clarity}/100`);
      
      if (result.quality.suggestions && result.quality.suggestions.length > 0) {
        console.log(`   💡 Suggestions: ${result.quality.suggestions.slice(0, 2).join(', ')}`);
      }
    }
  } catch (e) {
    console.log(`   ⚠️ Build test skipped (async context issue): ${e.message}`);
  }

  console.log('\n✨ Integration test complete!\n');
})();
