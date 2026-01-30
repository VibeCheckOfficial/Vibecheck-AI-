# Known Limitations

This document tracks known limitations, planned features, and workarounds.

---

## CLI Features

### Authentication Methods

| Method | Status | Notes |
|--------|--------|-------|
| API Key | ✅ Working | Get key from dashboard, use `vibecheck login` |
| Email/Password | ✅ Working | Direct API authentication |
| Magic Link | ✅ Working | Passwordless login via email |
| OAuth (GitHub/Google) | ✅ Working | Guided to use API key from dashboard after web OAuth |

### Commands

| Command | Status | Notes |
|---------|--------|-------|
| `vibecheck scan` | ✅ Working | Generate truthpack from codebase |
| `vibecheck check` | ✅ Working | Run hallucination detection |
| `vibecheck validate` | ✅ Working | Validate files against truthpack |
| `vibecheck ship` | ✅ Working | Ship Score calculation |
| `vibecheck fix` | ✅ Working | Interactive fix suggestions |
| `vibecheck trace` | ✅ Working | Data flow tracing and analysis |
| `vibecheck doctor` | ✅ Working | Environment diagnostics |
| `vibecheck init` | ✅ Working | Initialize project configuration |
| `vibecheck watch` | ✅ Working | Watch mode for continuous validation |
| `vibecheck report` | ✅ Working | Generate reports in various formats |
| `vibecheck login` | ✅ Working | Authenticate with dashboard |
| `vibecheck logout` | ✅ Working | Clear stored credentials |

---

## Flow Tracing

**Status: ✅ Implemented**

The `vibecheck trace` command provides full data flow analysis:

### Features
- Track where data comes from (sources: user input, API responses, database, etc.)
- See where it goes (sinks: database writes, API calls, HTML rendering, etc.)
- Identify transformation points
- Spot where validation is missing
- Risk assessment for each flow path

### Usage

```bash
# Trace a single file
vibecheck trace src/api/users.ts

# Trace a directory
vibecheck trace src/

# Output as JSON
vibecheck trace --format json

# Generate Mermaid diagram
vibecheck trace --format mermaid -o flow.md

# Quiet mode (one-line summary)
vibecheck trace --quiet
```

### Source Categories Detected
- User input (req.body, req.query, req.params, cookies, headers)
- API responses (fetch, axios)
- Database queries (Prisma, raw SQL)
- Environment variables (process.env)
- File system reads

### Sink Categories Detected
- Database writes (insert, update, delete)
- Raw SQL queries (injection risk)
- HTML rendering (XSS risk)
- Shell execution
- Dynamic eval
- File writes
- HTTP responses
- Logging (info leak risk)

### Validation Patterns Recognized
- Zod, Joi, Yup schema validation
- Type checks (typeof, instanceof)
- Sanitization (DOMPurify, escape functions)
- Null checks
- Bounds/length validation
- Parameterized queries

---

## Stripe Payment Integration

**Status: ✅ Configured**

| Component | Status | Details |
|-----------|--------|---------|
| API Key | ✅ Configured | Live mode enabled |
| Pro Monthly Price | ✅ Created | $29/month |
| Pro Annual Price | ✅ Created | $278.40/year (20% discount) |
| Webhook Endpoint | ✅ Configured | `/api/webhooks/stripe` |

### Webhook Events Handled
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

---

## Not Yet Implemented

The following features are planned but not yet implemented:

### High Priority
- [ ] VS Code extension real-time decorations
- [ ] Runtime verification cloud upload
- [ ] Route filtering for runtime checks

### Medium Priority
- [ ] Cross-file flow tracing (trace data across module boundaries)
- [ ] Custom flow pattern configuration
- [ ] Flow tracing for React components

### Lower Priority
- [ ] Historical flow analysis
- [ ] Flow diff between branches
- [ ] IDE inline flow visualization

---

## Reporting Issues

If you encounter a limitation not listed here, please:

1. Check the [GitHub Issues](https://github.com/vibecheck-ai/vibecheck/issues)
2. Search for existing reports
3. Open a new issue with the `limitation` label

---

*Last updated: 2026-01-30*
