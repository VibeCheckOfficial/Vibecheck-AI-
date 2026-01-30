/**
 * Transport Layer for MCP Server
 * 
 * Provides abstraction for different transport mechanisms:
 * - Stdio (default for CLI/local)
 * - HTTP (for cloud mode)
 * - WebSocket (for real-time cloud mode)
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { createServer, type Server as HttpServer, type IncomingMessage, type ServerResponse } from 'http';
import { WebSocketServer, type WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { loadConfig } from '@repo/shared-config';

export type TransportType = 'stdio' | 'http' | 'websocket';

export interface TransportConfig {
  type: TransportType;
  port?: number;
  host?: string;
  path?: string;
}

/**
 * Create a transport based on configuration
 */
export function createTransport(config: TransportConfig): Transport {
  switch (config.type) {
    case 'stdio':
      return new StdioServerTransport();
    case 'http':
      return new HTTPTransport({
        port: config.port ?? 3001,
        host: config.host ?? 'localhost',
        path: config.path ?? '/mcp',
      });
    case 'websocket':
      return new WebSocketTransport({
        port: config.port ?? 3002,
        host: config.host ?? 'localhost',
        path: config.path ?? '/mcp',
      });
    default:
      throw new Error(`Unknown transport type: ${config.type}`);
  }
}

/**
 * Get transport config from environment
 */
export function getTransportConfigFromEnv(): TransportConfig {
  const config = loadConfig();
  const mode = config.VIBECHECK_MODE;
  const transportType = config.VIBECHECK_TRANSPORT;
  
  if (transportType) {
    return {
      type: transportType,
      port: config.VIBECHECK_PORT,
      host: config.VIBECHECK_HOST,
      path: config.VIBECHECK_PATH,
    };
  }
  
  // Default based on mode
  if (mode === 'cloud') {
    return { type: 'http', port: 3001 };
  }
  
  return { type: 'stdio' };
}

interface HTTPTransportConfig {
  port: number;
  host: string;
  path: string;
}

/**
 * HTTP Transport for MCP
 * 
 * Implements request/response pattern over HTTP POST
 */
export class HTTPTransport extends EventEmitter implements Transport {
  private server: HttpServer | null = null;
  private config: HTTPTransportConfig;
  private messageHandler: ((message: unknown) => void) | null = null;
  
  constructor(config: HTTPTransportConfig) {
    super();
    this.config = config;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
        this.handleRequest(req, res);
      });

      this.server.on('error', (error) => {
        this.emit('error', error);
        reject(error);
      });

      this.server.listen(this.config.port, this.config.host, () => {
        console.error(`MCP HTTP Transport listening on http://${this.config.host}:${this.config.port}${this.config.path}`);
        resolve();
      });
    });
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    // CORS headers for browser access
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method !== 'POST' || req.url !== this.config.path) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const message = JSON.parse(body);
        
        // Store the response handler for this request
        const responsePromise = new Promise<unknown>((resolve) => {
          // The MCP server will call send() with the response
          const originalHandler = this.messageHandler;
          this.messageHandler = (response: unknown) => {
            resolve(response);
            this.messageHandler = originalHandler;
          };
        });

        // Emit the message for the MCP server to handle
        this.emit('message', message);
        
        // Wait for response (with timeout)
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout')), 30000);
        });

        const response = await Promise.race([responsePromise, timeoutPromise]);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: errorMessage }));
      }
    });
  }

  async send(message: unknown): Promise<void> {
    if (this.messageHandler) {
      this.messageHandler(message);
    }
  }

  async close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  onmessage?: (message: unknown) => void;
  onerror?: (error: Error) => void;
  onclose?: () => void;
}

interface WebSocketTransportConfig {
  port: number;
  host: string;
  path: string;
}

/**
 * WebSocket Transport for MCP
 * 
 * Implements bidirectional streaming over WebSocket
 */
export class WebSocketTransport extends EventEmitter implements Transport {
  private wss: WebSocketServer | null = null;
  private httpServer: HttpServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private config: WebSocketTransportConfig;

  constructor(config: WebSocketTransportConfig) {
    super();
    this.config = config;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer = createServer();
      
      this.wss = new WebSocketServer({
        server: this.httpServer,
        path: this.config.path,
      });

      this.wss.on('connection', (ws: WebSocket) => {
        this.clients.add(ws);
        console.error('MCP WebSocket client connected');

        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            this.emit('message', message);
            if (this.onmessage) {
              this.onmessage(message);
            }
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        });

        ws.on('close', () => {
          this.clients.delete(ws);
          console.error('MCP WebSocket client disconnected');
        });

        ws.on('error', (error) => {
          console.error('WebSocket error:', error);
          this.clients.delete(ws);
        });
      });

      this.wss.on('error', (error) => {
        this.emit('error', error);
        if (this.onerror) {
          this.onerror(error);
        }
        reject(error);
      });

      this.httpServer.listen(this.config.port, this.config.host, () => {
        console.error(`MCP WebSocket Transport listening on ws://${this.config.host}:${this.config.port}${this.config.path}`);
        resolve();
      });
    });
  }

  async send(message: unknown): Promise<void> {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(data);
      }
    }
  }

  async close(): Promise<void> {
    // Close all client connections
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();

    // Close WebSocket server
    return new Promise((resolve) => {
      if (this.wss) {
        this.wss.close(() => {
          if (this.httpServer) {
            this.httpServer.close(() => {
              this.wss = null;
              this.httpServer = null;
              resolve();
            });
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  onmessage?: (message: unknown) => void;
  onerror?: (error: Error) => void;
  onclose?: () => void;
}

export { StdioServerTransport };
