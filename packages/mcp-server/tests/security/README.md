# Security Test Harness

This directory contains security tests for the MCP server.

## Running Tests

```bash
# Run all security tests
pnpm test:security

# Run specific test category
pnpm test:security -- path-traversal
pnpm test:security -- regex-dos
pnpm test:security -- input-size
pnpm test:security -- rate-limit
```

## Test Structure

- `test-harness.ts` - Main test harness and test case definitions
- `path-traversal.test.ts` - Path traversal attack tests
- `regex-dos.test.ts` - ReDoS attack tests
- `input-size.test.ts` - Input size limit tests
- `rate-limit.test.ts` - Rate limiting tests

## Adding New Tests

1. Create test cases using the `TestCase` interface
2. Add to appropriate test file or create new one
3. Run tests and verify they pass/fail as expected

## Test Results

Test results are exported as JSON and can be analyzed for:
- Pass/fail rates
- Performance metrics
- Security coverage
