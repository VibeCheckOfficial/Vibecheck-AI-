# 💡 Quick Fixes

Vibecheck doesn't just find problems — it fixes them.

## One-Click Fixes

When you see a lightbulb 💡 or squiggly underline:

1. **Hover** to see what's wrong
2. **Click the lightbulb** or press `Cmd+.` / `Ctrl+.`
3. **Select the fix** from the menu

## Example Fixes

### Silent Catch → Proper Error Handling
```typescript
// Before
catch (e) { }

// After (one click)
catch (error) {
  console.error('Error:', error);
  throw error;
}
```

### Hardcoded Secret → Environment Variable
```typescript
// Before
const apiKey = 'sk-abc123...';

// After (one click)
const apiKey = process.env.API_KEY;
```

### Fake Feature → Proper Stub
```typescript
// Before
async function saveUser() { }

// After (one click)
async function saveUser() {
  throw new Error('Not implemented');
}
```

## Ignore Rules

Don't want to fix something? Add an ignore comment:
```typescript
// Vibecheck-disable-next-line CG001
const testData = [{ name: 'John' }];
```
