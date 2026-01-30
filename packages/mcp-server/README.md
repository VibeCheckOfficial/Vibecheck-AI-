<p align="center">
  <img src="https://vibecheckai.dev/logo.png" alt="VibeCheck Logo" width="120" />
</p>

<h1 align="center">VibeCheck MCP Server</h1>

<p align="center">
  <strong>Model Context Protocol server for hallucination prevention</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@vibecheckai/mcp-server"><img src="https://img.shields.io/npm/v/@vibecheckai/mcp-server.svg?style=flat-square&color=blue" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@vibecheckai/mcp-server"><img src="https://img.shields.io/npm/dm/@vibecheckai/mcp-server.svg?style=flat-square&color=green" alt="npm downloads" /></a>
  <a href="https://github.com/vibecheckai/vibecheck/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="license" /></a>
</p>

<p align="center">
  <a href="https://vibecheckai.dev">Website</a> •
  <a href="https://vibecheckai.dev/docs/mcp">Documentation</a> •
  <a href="https://vibecheckai.dev/discord">Discord</a>
</p>

---

## What is this?

The VibeCheck MCP Server brings **hallucination prevention** directly into AI-powered IDEs like [Cursor](https://cursor.sh). It implements the [Model Context Protocol](https://modelcontextprotocol.io) to give AI assistants access to your project's verified truth layer.

```
┌─────────────────────────────────────────────────────────────┐
│                      Cursor IDE                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                   Claude AI                           │  │
│  │                                                       │  │
│  │  "Let me check the truthpack for the correct         │  │
│  │   API endpoint..."                                    │  │
│  │                                                       │  │
│  │  → vibecheck_truthpack_get { section: "routes" }     │  │
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                            │                                │
│                            ▼                                │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              VibeCheck MCP Server                     │  │
│  │                                                       │  │
│  │  Returns verified facts from your codebase           │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Installation

```bash
npm install -g @vibecheckai/mcp-server
```

### Configure Cursor

Add to your Cursor settings (`~/.cursor/mcp.json` or via Settings → MCP):

```json
{
  "mcpServers": {
    "vibecheck": {
      "command": "vibecheck-mcp"
    }
  }
}
```

Restart Cursor, and the AI assistant now has access to VibeCheck tools!

### Initialize Your Project

Before using the MCP server, initialize VibeCheck in your project:

```bash
cd your-project
npx vibecheck-ai init
```

This creates a `.vibecheck/` directory with your project's truthpack.

## Available Tools

The MCP server exposes these tools to AI assistants:

### Truthpack Tools

| Tool | Description |
|------|-------------|
| `vibecheck_truthpack_get` | Get truthpack data (routes, env, auth, etc.) |
| `vibecheck_truthpack_search` | Search truthpack for specific information |
| `vibecheck_truthpack_validate` | Validate a claim against the truthpack |

### Context Tools

| Tool | Description |
|------|-------------|
| `vibecheck_context_gather` | Gather relevant context for a task |
| `vibecheck_context_files` | Get file contents with metadata |
| `vibecheck_context_dependencies` | Get dependency information |

### Validation Tools

| Tool | Description |
|------|-------------|
| `vibecheck_validate_code` | Validate code for hallucinations |
| `vibecheck_validate_claim` | Verify a specific claim |
| `vibecheck_validate_diff` | Check a diff for issues |

### Firewall Tools

| Tool | Description |
|------|-------------|
| `vibecheck_firewall_check` | Check if a file is protected |
| `vibecheck_firewall_status` | Get firewall status for paths |

### Forge Tools

| Tool | Description |
|------|-------------|
| `vibecheck_forge_run` | Generate/update truthpack |
| `vibecheck_forge_status` | Check forge status |

## How AI Uses These Tools

When you ask Claude in Cursor to help with your code, it can now:

### 1. Check Facts Before Answering

```
User: "Add a new API endpoint for user profiles"

Claude (internally):
  → vibecheck_truthpack_get { section: "routes" }
  → vibecheck_truthpack_get { section: "auth" }
  
Claude: "Based on your existing routes, I'll add the endpoint
following your pattern of using /api/v1/ prefix with JWT auth..."
```

### 2. Validate Its Own Output

```
Claude (internally):
  → vibecheck_validate_code { code: "..." }
  
Claude: "I've validated this against your truthpack.
The code correctly uses your existing patterns."
```

### 3. Respect Protected Files

```
Claude (internally):
  → vibecheck_firewall_check { path: ".env" }
  
Claude: "I notice .env is protected by the firewall.
I'll suggest changes without modifying it directly."
```

## Transport Options

The MCP server supports multiple transport modes:

### Stdio (Default)

Used by Cursor and other MCP clients:

```bash
vibecheck-mcp
# or
vibecheck-mcp --stdio
```

### HTTP

For cloud deployments or custom integrations:

```bash
vibecheck-mcp --http --port 3001
```

### WebSocket

For real-time bidirectional communication:

```bash
vibecheck-mcp --websocket --port 3002
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VIBECHECK_MODE` | Operation mode: `local`, `cloud`, `hybrid` | `local` |
| `VIBECHECK_TRANSPORT` | Transport: `stdio`, `http`, `websocket` | `stdio` |
| `VIBECHECK_PORT` | Port for HTTP/WebSocket | `3001` |
| `VIBECHECK_HOST` | Host for HTTP/WebSocket | `localhost` |

### Project Configuration

The MCP server reads your project's `vibecheck.config.mjs`:

```javascript
/** @type {import('vibecheck-ai').VibeCheckConfig} */
export default {
  // Truthpack settings
  truthpack: {
    sections: ['routes', 'env', 'auth', 'database'],
    autoRefresh: true,
  },
  
  // Firewall settings
  firewall: {
    locked: ['.env*', 'src/core/**'],
    warn: ['package.json'],
  },
  
  // Analysis settings
  analysis: {
    strictness: 'standard',
  },
};
```

## Security

The MCP server is designed with security in mind:

- **Read-only by default** — Tools only read from your codebase
- **Path validation** — All file access is validated and sandboxed
- **Rate limiting** — Built-in protection against abuse
- **No network calls** — Local mode never phones home

## Comparison

| Feature | Without VibeCheck | With VibeCheck MCP |
|---------|-------------------|---------------------|
| AI knowledge of your code | General patterns | Your exact implementation |
| API endpoint accuracy | Often guessed | Verified from truthpack |
| Environment variables | Frequently invented | Checked against schema |
| Protected files | Can be modified | Firewall enforced |
| Code patterns | Generic suggestions | Your project's patterns |

## Example Session

Here's what happens when you work with Claude in Cursor with VibeCheck:

```
You: "I need to add rate limiting to the /api/users endpoint"

Claude:
  [Calling vibecheck_truthpack_get with section: "routes"]
  
  I found your /api/users endpoint in the truthpack. It's currently
  defined in src/routes/users.ts using Express with JWT authentication.
  
  [Calling vibecheck_context_files with path: "src/routes/users.ts"]
  
  Looking at your existing code, I see you're using express-rate-limit
  in other routes. Here's how to add it consistently:
  
  ```typescript
  import rateLimit from 'express-rate-limit';
  
  const userRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // matches your existing config
    max: 100,
  });
  
  router.get('/api/users', userRateLimit, authenticate, getUsers);
  ```
  
  [Calling vibecheck_validate_code]
  
  ✓ Validated against truthpack - uses correct patterns
```

## Troubleshooting

### Server Not Starting

```bash
# Check if another instance is running
ps aux | grep vibecheck-mcp

# Run with verbose logging
DEBUG=vibecheck:* vibecheck-mcp
```

### Cursor Not Connecting

1. Restart Cursor after adding MCP configuration
2. Check MCP server status in Cursor settings
3. Verify the command path: `which vibecheck-mcp`

### Truthpack Not Found

```bash
# Initialize VibeCheck in your project
cd your-project
npx vibecheck-ai init

# Verify .vibecheck directory exists
ls -la .vibecheck/
```

## Related Packages

- **[vibecheck-ai](https://npmjs.com/package/vibecheck-ai)** — CLI for VibeCheck
- **[VibeCheck VS Code Extension](https://marketplace.visualstudio.com/items?itemName=vibecheckai.vibecheck)** — VS Code integration

## Contributing

We welcome contributions! See [CONTRIBUTING.md](https://github.com/vibecheckai/vibecheck/blob/main/CONTRIBUTING.md).

## License

MIT © [VibeCheck AI](https://vibecheckai.dev)

---

<p align="center">
  <strong>Give your AI the context it needs.</strong>
</p>

<p align="center">
  <a href="https://vibecheckai.dev/docs/mcp">Read the Docs →</a>
</p>
