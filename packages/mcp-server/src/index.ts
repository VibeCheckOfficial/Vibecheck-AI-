#!/usr/bin/env node
/**
 * VibeCheck MCP Server
 * 
 * Model Context Protocol server for hallucination prevention.
 * Provides tools for truthpack management, context gathering,
 * firewall validation, and code verification.
 * 
 * Usage:
 *   vibecheck-mcp                    # Start with stdio (default)
 *   vibecheck-mcp --http             # Start with HTTP transport
 *   vibecheck-mcp --websocket        # Start with WebSocket transport
 *   vibecheck-mcp --port 3001        # Specify port (for HTTP/WS)
 *   vibecheck-mcp --host 0.0.0.0     # Specify host (for HTTP/WS)
 * 
 * Environment variables:
 *   VIBECHECK_MODE=local|cloud|hybrid
 *   VIBECHECK_TRANSPORT=stdio|http|websocket
 *   VIBECHECK_PORT=3001
 *   VIBECHECK_HOST=localhost
 */

import { VibeCheckServer } from './server.js';
import type { TransportConfig, TransportType } from './transport/index.js';
import { loadConfig } from '@repo/shared-config';

function parseArgs(): TransportConfig {
  const config = loadConfig();
  const args = process.argv.slice(2);
  
  let type: TransportType = 'stdio';
  let port: number | undefined;
  let host: string | undefined;
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--http':
        type = 'http';
        break;
      case '--websocket':
      case '--ws':
        type = 'websocket';
        break;
      case '--stdio':
        type = 'stdio';
        break;
      case '--port':
        port = parseInt(args[++i] ?? '3001', 10);
        break;
      case '--host':
        host = args[++i];
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }
  
  // Use centralized config as fallback
  if (config.VIBECHECK_TRANSPORT) {
    type = config.VIBECHECK_TRANSPORT as TransportType;
  }
  if (config.VIBECHECK_PORT && !port) {
    port = config.VIBECHECK_PORT;
  }
  if (config.VIBECHECK_HOST && !host) {
    host = config.VIBECHECK_HOST;
  }
  
  return { type, port, host };
}

function printHelp(): void {
  console.log(`
VibeCheck MCP Server - Hallucination prevention for AI development

Usage:
  vibecheck-mcp [options]

Options:
  --stdio           Use stdio transport (default)
  --http            Use HTTP transport
  --websocket, --ws Use WebSocket transport
  --port <port>     Port for HTTP/WebSocket (default: 3001)
  --host <host>     Host for HTTP/WebSocket (default: localhost)
  -h, --help        Show this help message

Environment Variables:
  VIBECHECK_MODE       Set mode: local, cloud, or hybrid
  VIBECHECK_TRANSPORT  Set transport: stdio, http, or websocket
  VIBECHECK_PORT       Port for HTTP/WebSocket transport
  VIBECHECK_HOST       Host for HTTP/WebSocket transport

Examples:
  vibecheck-mcp                         # Start with stdio (for CLI)
  vibecheck-mcp --http --port 3001      # Start HTTP server on port 3001
  vibecheck-mcp --websocket             # Start WebSocket server
`);
}

async function main(): Promise<void> {
  const config = parseArgs();
  const server = new VibeCheckServer();
  await server.start(config);
}

main().catch((error) => {
  console.error('Failed to start VibeCheck MCP Server:', error);
  process.exit(1);
});
