/**
 * Tracing Middleware
 * 
 * Traces all operations for debugging and audit purposes.
 */

export interface TraceEntry {
  id: string;
  timestamp: Date;
  tool: string;
  parameters: Record<string, unknown>;
  result: 'success' | 'error' | 'blocked';
  duration: number;
  error?: string;
  metadata: Record<string, unknown>;
}

export interface TraceSpan {
  id: string;
  parentId?: string;
  name: string;
  startTime: Date;
  endTime?: Date;
  status: 'running' | 'completed' | 'error';
  entries: TraceEntry[];
}

export class TracingMiddleware {
  private traces: TraceEntry[] = [];
  private spans: Map<string, TraceSpan> = new Map();
  private currentSpanId?: string;

  /**
   * Start a new trace span
   */
  startSpan(name: string, parentId?: string): string {
    const id = this.generateId();
    const span: TraceSpan = {
      id,
      parentId,
      name,
      startTime: new Date(),
      status: 'running',
      entries: [],
    };
    this.spans.set(id, span);
    this.currentSpanId = id;
    return id;
  }

  /**
   * End a trace span
   */
  endSpan(spanId: string, status: 'completed' | 'error' = 'completed'): void {
    const span = this.spans.get(spanId);
    if (span) {
      span.endTime = new Date();
      span.status = status;
    }
  }

  /**
   * Trace a tool call
   */
  async trace<T>(
    tool: string,
    parameters: Record<string, unknown>,
    fn: () => Promise<T>
  ): Promise<T> {
    const entry: TraceEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      tool,
      parameters: this.sanitizeParameters(parameters),
      result: 'success',
      duration: 0,
      metadata: {},
    };

    const startTime = Date.now();

    try {
      const result = await fn();
      entry.duration = Date.now() - startTime;
      entry.result = 'success';
      this.addEntry(entry);
      return result;
    } catch (error) {
      entry.duration = Date.now() - startTime;
      entry.result = 'error';
      entry.error = error instanceof Error ? error.message : 'Unknown error';
      this.addEntry(entry);
      throw error;
    }
  }

  /**
   * Record a blocked operation
   */
  recordBlocked(tool: string, parameters: Record<string, unknown>, reason: string): void {
    const entry: TraceEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      tool,
      parameters: this.sanitizeParameters(parameters),
      result: 'blocked',
      duration: 0,
      metadata: { blockReason: reason },
    };
    this.addEntry(entry);
  }

  /**
   * Get all traces
   */
  getTraces(): TraceEntry[] {
    return [...this.traces];
  }

  /**
   * Get traces for a specific time range
   */
  getTracesByTimeRange(start: Date, end: Date): TraceEntry[] {
    return this.traces.filter(
      t => t.timestamp >= start && t.timestamp <= end
    );
  }

  /**
   * Get traces by tool
   */
  getTracesByTool(tool: string): TraceEntry[] {
    return this.traces.filter(t => t.tool === tool);
  }

  /**
   * Get span with all entries
   */
  getSpan(spanId: string): TraceSpan | undefined {
    return this.spans.get(spanId);
  }

  /**
   * Export traces for debugging
   */
  exportTraces(): string {
    return JSON.stringify({
      traces: this.traces,
      spans: Array.from(this.spans.values()),
    }, null, 2);
  }

  /**
   * Clear all traces
   */
  clear(): void {
    this.traces = [];
    this.spans.clear();
    this.currentSpanId = undefined;
  }

  private addEntry(entry: TraceEntry): void {
    this.traces.push(entry);

    // Add to current span if active
    if (this.currentSpanId) {
      const span = this.spans.get(this.currentSpanId);
      if (span) {
        span.entries.push(entry);
      }
    }

    // Keep trace history bounded
    if (this.traces.length > 10000) {
      this.traces = this.traces.slice(-5000);
    }
  }

  private sanitizeParameters(params: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(params)) {
      // Truncate large string values
      if (typeof value === 'string' && value.length > 1000) {
        sanitized[key] = value.slice(0, 1000) + '...[truncated]';
      } else if (key.toLowerCase().includes('password') || 
                 key.toLowerCase().includes('secret') ||
                 key.toLowerCase().includes('token')) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  private generateId(): string {
    return `trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
