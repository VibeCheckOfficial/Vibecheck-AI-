# MCP Server Security Analysis

**Date**: 2026-01-29  
**Reviewer**: Senior Staff Engineer + Security Reviewer  
**Scope**: `@vibecheck/mcp-server` package

## Executive Summary

This document provides a comprehensive security analysis of the VibeCheck MCP Server, identifying attack surfaces, vulnerabilities, and mitigations. The server exposes 30+ tools across 7 categories (truthpack, context, firewall, validation, registration, intent, prompt) and supports three transport modes (stdio, HTTP, WebSocket).

**Risk Level**: **HIGH** - Multiple critical and high-severity issues identified.

---

## 1. Attack Surface Enumeration

### 1.1 Tools Inventory

**Truthpack Tools** (4 tools):
- `truthpack_generate` - Scans codebase, writes JSON files
- `truthpack_query` - Reads truthpack data with regex filters
- `truthpack_validate` - Validates truthpack freshness
- `truthpack_routes`, `truthpack_env` - Query specific categories

**Context Tools** (5 tools):
- `context_gather` - Reads files, globs directories
- `context_for_file` - Reads arbitrary files, searches codebase
- `context_structure` - Recursive directory traversal
- `context_conventions` - Reads knowledge files
- `context_update_embeddings` - Placeholder (no-op)

**Firewall Tools** (8 tools):
- `firewall_evaluate` - Validates code against firewall
- `firewall_quick_check` - Quick validation
- `firewall_extract_claims` - Extracts claims from code
- `firewall_resolve_evidence` - Resolves evidence for claims
- `firewall_unblock_plan` - Generates unblock plans
- `firewall_status`, `firewall_get_mode`, `firewall_set_mode`, `firewall_lockdown` - Mode management

**Validation Tools** (5 tools):
- `validation_detect_hallucinations` - Analyzes code
- `validation_verify` - Verifies claims
- `validation_code` - Full code validation
- `validation_detect_drift` - Placeholder
- `validation_verify_imports` - Verifies imports

**Registration Tools** (5 tools):
- `register_pattern` - Writes to `.vibecheck/knowledge/patterns.json`
- `register_convention` - Writes to `.vibecheck/knowledge/conventions.json`
- `register_endpoint` - Writes to `.vibecheck/truthpack/routes.json`
- `register_env_var` - Writes to `.vibecheck/truthpack/env.json`
- `register_type` - Writes to `.vibecheck/truthpack/contracts.json`

**Intent Tools** (7 tools):
- `intent_declare` - Declares operation scope
- `intent_get`, `intent_clear`, `intent_check`, `intent_extend`, `intent_restrict`, `intent_history` - Intent management

**Prompt Tools** (5 tools):
- `prompt_plan_task` - Plans tasks
- `prompt_get_task` - Gets task details
- `prompt_verify` - Verifies prompts
- `prompt_quick_check` - Quick prompt check
- `prompt_build` - Builds enhanced prompts
- `prompt_templates` - Lists templates

**Hook Tools** (3 tools):
- `hook_pre_generation` - Pre-generation validation
- `hook_post_generation` - Post-generation validation
- `hook_file_write` - File write validation

**Middleware Tools** (4 tools):
- `middleware_traces` - Returns trace data
- `middleware_intent_history` - Returns intent history
- `middleware_export_traces` - Exports all traces
- `middleware_clear_traces` - Clears traces

**Total**: 46 tools

### 1.2 Transport Modes

1. **Stdio** (default) - Local process communication
   - Attack surface: Low (local only)
   - Risk: Process injection if parent compromised

2. **HTTP** (`/mcp` endpoint)
   - Attack surface: High (network exposed)
   - Risk: No authentication, CORS wildcard (`*`), no rate limiting

3. **WebSocket** (`/mcp` endpoint)
   - Attack surface: High (network exposed)
   - Risk: No authentication, no rate limiting, broadcast to all clients

### 1.3 Permission Model

**Current State**: No authentication or authorization. All tools accessible to all callers.

**Implications**:
- Any client can read arbitrary files via `context_for_file`
- Any client can write to `.vibecheck/` directory via registration tools
- Any client can trigger expensive operations (glob, file scans)
- No tenant isolation or scoped permissions

---

## 2. Critical Vulnerabilities

### 2.1 Path Traversal (CRITICAL)

**Location**: Multiple tools accepting `filePath`, `targetFile`, `target` parameters

**Vulnerable Code**:
```typescript
// context-tools.ts:168
const fullPath = path.isAbsolute(filePath) 
  ? filePath 
  : path.join(projectRoot, filePath);
const fileContent = await fs.readFile(fullPath, 'utf-8');
```

**Attack Vector**:
```json
{
  "filePath": "../../../etc/passwd",
  "includeImports": true
}
```

**Impact**: Read arbitrary files outside project root, including system files, secrets, etc.

**CVSS**: 9.1 (Critical)

**Mitigation**: Implement strict path validation (see Section 4.1)

---

### 2.2 Regex DoS (ReDoS) (HIGH)

**Location**: `truthpack_query`, `truthpack_routes`, `context_for_file`

**Vulnerable Code**:
```typescript
// truthpack-tools.ts:243
const filterRegex = new RegExp(filter.replace(/\*/g, '.*'), 'i');
```

**Attack Vector**:
```json
{
  "category": "routes",
  "filter": "((a+)+)+$"
}
```

**Impact**: CPU exhaustion, denial of service

**CVSS**: 7.5 (High)

**Mitigation**: Validate regex patterns, limit complexity, add timeout

---

### 2.3 Unbounded Resource Consumption (HIGH)

**Multiple Issues**:

1. **Unbounded glob operations**:
   ```typescript
   // context-tools.ts:181
   const allFiles = await glob('**/*.{ts,tsx,js,jsx}', {
     cwd: projectRoot,
     ignore: ['node_modules/**', 'dist/**', 'build/**'],
   });
   ```

2. **Unbounded file reads**:
   ```typescript
   // context-tools.ts:191
   for (const file of allFiles.slice(0, 100)) {
     const content = await fs.readFile(path.join(projectRoot, file), 'utf-8');
   }
   ```

3. **Unbounded trace storage**:
   ```typescript
   // tracing-middleware.ts:174
   if (this.traces.length > 10000) {
     this.traces = this.traces.slice(-5000);
   }
   ```

**Impact**: Memory exhaustion, disk I/O exhaustion, DoS

**CVSS**: 7.5 (High)

**Mitigation**: Add limits, timeouts, concurrency caps

---

### 2.4 No Input Size Limits (HIGH)

**Location**: All tools accepting `content`, `code`, `prompt` parameters

**Vulnerable Code**:
```typescript
// firewall-tools.ts:80
content: z.string().describe('Code content to evaluate'),
```

**Attack Vector**:
```json
{
  "action": "write",
  "target": "test.ts",
  "content": "x".repeat(100_000_000) // 100MB string
}
```

**Impact**: Memory exhaustion, DoS

**CVSS**: 7.5 (High)

**Mitigation**: Enforce max payload sizes (see Section 4.2)

---

### 2.5 No Rate Limiting (HIGH)

**Location**: HTTP and WebSocket transports

**Vulnerable Code**:
```typescript
// transport/index.ts:112
private handleRequest(req: IncomingMessage, res: ServerResponse): void {
  // No rate limiting
}
```

**Impact**: DoS via request flooding, resource exhaustion

**CVSS**: 7.5 (High)

**Mitigation**: Implement rate limiting (see Section 4.3)

---

### 2.6 Information Disclosure (MEDIUM)

**Location**: Error handling throughout

**Vulnerable Code**:
```typescript
// Multiple locations
catch (err) {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        error: err instanceof Error ? err.message : 'Unknown error',
      }),
    }],
  };
}
```

**Issues**:
- File paths leaked in errors
- Stack traces potentially exposed
- Internal structure revealed

**Impact**: Information leakage, reconnaissance

**CVSS**: 5.3 (Medium)

**Mitigation**: Sanitize errors, use error codes (see Section 4.4)

---

### 2.7 CORS Wildcard (MEDIUM)

**Location**: HTTP transport

**Vulnerable Code**:
```typescript
// transport/index.ts:114
res.setHeader('Access-Control-Allow-Origin', '*');
```

**Impact**: Any origin can call the API, CSRF risk

**CVSS**: 5.3 (Medium)

**Mitigation**: Configurable CORS, require authentication

---

### 2.8 No Timeout Enforcement (MEDIUM)

**Location**: Tool execution, file operations

**Vulnerable Code**:
```typescript
// No timeout on file operations
const content = await fs.readFile(fullPath, 'utf-8');
```

**Impact**: Hanging requests, resource exhaustion

**CVSS**: 5.3 (Medium)

**Mitigation**: Add timeouts (see Section 4.5)

---

### 2.9 Weak Path Validation (MEDIUM)

**Location**: Registration tools writing to `.vibecheck/`

**Vulnerable Code**:
```typescript
// registration-tools.ts:62
const patternsPath = path.join(getKnowledgePath(), 'patterns.json');
await saveJson(patternsPath, existing);
```

**Issues**:
- No validation that paths stay within `.vibecheck/`
- No validation of JSON structure/size
- Can overwrite critical files

**Impact**: Data corruption, DoS

**CVSS**: 5.3 (Medium)

**Mitigation**: Strict path allowlists, schema validation

---

### 2.10 Prompt Injection Risk (LOW)

**Location**: Tool descriptions, prompt building

**Note**: Tool descriptions are static, but prompt building uses user input. Risk is low but should be monitored.

**Mitigation**: Sanitize user input in prompts, separate system policy from tool text

---

## 3. Threat Model

### 3.1 Attack Scenarios

**Scenario 1: Path Traversal Attack**
1. Attacker calls `context_for_file` with `"../../.env"`
2. Server reads `.env` file outside project root
3. Secrets leaked

**Scenario 2: ReDoS Attack**
1. Attacker calls `truthpack_query` with malicious regex
2. Server CPU spikes to 100%
3. DoS achieved

**Scenario 3: Resource Exhaustion**
1. Attacker sends 1000 concurrent requests to `context_structure` with `depth: 100`
2. Server runs out of memory/file handles
3. DoS achieved

**Scenario 4: Data Corruption**
1. Attacker calls `register_endpoint` with malformed data
2. Server writes corrupted JSON to `routes.json`
3. Truthpack becomes unusable

**Scenario 5: Information Disclosure**
1. Attacker calls tools with invalid inputs
2. Error messages reveal file paths, internal structure
3. Reconnaissance successful

### 3.2 Attackers

1. **External Attacker** (HTTP/WebSocket exposed)
   - Access: Network access to server
   - Capability: Send arbitrary requests
   - Goal: Read secrets, DoS, data corruption

2. **Compromised Client** (Stdio mode)
   - Access: Local process communication
   - Capability: Send arbitrary tool calls
   - Goal: Escalate privileges, read sensitive files

3. **Malicious AI Agent** (via MCP client)
   - Access: Legitimate MCP connection
   - Capability: Call any tool
   - Goal: Read/write outside intended scope

---

## 4. Mitigations

### 4.1 Path Sanitization

**Implementation**: `src/security/path-validator.ts`

**Requirements**:
- All paths must be relative to project root
- Resolve and validate against project root
- Reject paths containing `..`, absolute paths outside root
- Allowlist for specific operations

**Verification**:
```bash
# Test path traversal attempts
pnpm test:security -- path-traversal
```

---

### 4.2 Input Size Limits

**Implementation**: `src/security/input-validator.ts`

**Limits**:
- Max content size: 10MB
- Max file path length: 4096 chars
- Max array size: 1000 items
- Max string length: 1MB

**Verification**:
```bash
# Test oversized inputs
pnpm test:security -- payload-size
```

---

### 4.3 Rate Limiting

**Implementation**: `src/security/rate-limiter.ts`

**Limits**:
- Per-client: 100 requests/minute
- Per-tool: 20 requests/minute
- Global: 1000 requests/minute
- Burst: 10 requests/second

**Verification**:
```bash
# Test rate limiting
pnpm test:security -- rate-limit
```

---

### 4.4 Error Handling

**Implementation**: `src/security/error-handler.ts`

**Requirements**:
- Never leak file paths
- Never leak stack traces
- Use error codes (e.g., `E_PATH_INVALID`, `E_SIZE_EXCEEDED`)
- Log detailed errors server-side only

**Verification**:
```bash
# Test error sanitization
pnpm test:security -- error-handling
```

---

### 4.5 Timeouts

**Implementation**: `src/security/timeout-wrapper.ts`

**Timeouts**:
- File operations: 5 seconds
- Tool execution: 30 seconds
- HTTP request: 30 seconds (existing)
- Glob operations: 10 seconds

**Verification**:
```bash
# Test timeout enforcement
pnpm test:security -- timeouts
```

---

### 4.6 Regex Validation

**Implementation**: `src/security/regex-validator.ts`

**Requirements**:
- Validate regex complexity
- Limit alternations, quantifiers
- Timeout regex execution
- Reject known ReDoS patterns

**Verification**:
```bash
# Test ReDoS protection
pnpm test:security -- regex-dos
```

---

### 4.7 Concurrency Limits

**Implementation**: `src/security/concurrency-limiter.ts`

**Limits**:
- Max concurrent tool executions: 10
- Max concurrent file operations: 20
- Max concurrent glob operations: 5

**Verification**:
```bash
# Test concurrency limits
pnpm test:security -- concurrency
```

---

### 4.8 Authentication (Future)

**Not Implemented**: Requires design decision on auth strategy.

**Options**:
1. API key authentication
2. JWT tokens
3. mTLS for WebSocket
4. OAuth2 for HTTP

**Recommendation**: Start with API key, evolve to JWT.

---

## 5. Verification Plan

### 5.1 Automated Tests

**Test Suite**: `tests/security/`

**Coverage**:
- Path traversal attempts
- ReDoS patterns
- Oversized payloads
- Rate limit enforcement
- Timeout enforcement
- Error sanitization
- Concurrency limits

**Run**:
```bash
pnpm test:security
```

---

### 5.2 Manual Verification

**Checklist**:
- [ ] Path traversal blocked
- [ ] ReDoS patterns rejected
- [ ] Oversized payloads rejected
- [ ] Rate limits enforced
- [ ] Timeouts enforced
- [ ] Errors sanitized
- [ ] Concurrency limited
- [ ] No secrets in logs

---

### 5.3 Performance Testing

**Metrics**:
- Request latency (p50, p95, p99)
- Memory usage under load
- CPU usage under load
- Concurrent request handling

**Tools**: `artillery`, `k6`

---

## 6. Rollback Plan

**If issues discovered**:

1. **Immediate**: Disable HTTP/WebSocket transports
   ```bash
   export VIBECHECK_TRANSPORT=stdio
   ```

2. **Short-term**: Revert to previous version
   ```bash
   git revert <commit>
   pnpm install
   ```

3. **Long-term**: Deploy fixes incrementally
   - Deploy path validation first
   - Deploy rate limiting second
   - Deploy remaining fixes

**Rollback Triggers**:
- Error rate > 1%
- Latency p95 > 1s
- Memory usage > 80%
- Security incident

---

## 7. Security Checklist

**Pre-Deployment**:
- [ ] All critical vulnerabilities mitigated
- [ ] Security tests passing
- [ ] Error handling verified
- [ ] Rate limiting configured
- [ ] Timeouts configured
- [ ] Path validation tested
- [ ] Input size limits tested
- [ ] Documentation updated

**Post-Deployment**:
- [ ] Monitor error rates
- [ ] Monitor latency
- [ ] Monitor resource usage
- [ ] Review security logs
- [ ] Update threat model

---

## 8. References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE-22: Path Traversal](https://cwe.mitre.org/data/definitions/22.html)
- [CWE-400: Uncontrolled Resource Consumption](https://cwe.mitre.org/data/definitions/400.html)
- [CWE-1333: ReDoS](https://cwe.mitre.org/data/definitions/1333.html)
- [MCP Specification](https://modelcontextprotocol.io/)

---

**Document Version**: 1.0  
**Last Updated**: 2026-01-29  
**Next Review**: 2026-04-29
