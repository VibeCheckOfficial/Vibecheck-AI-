/**
 * Hallucination Analytics
 * 
 * Tracks and analyzes hallucination patterns to improve prevention.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface AnalyticsReport {
  period: {
    start: Date;
    end: Date;
  };
  summary: MetricsSummary;
  trends: TrendData;
  topViolations: ViolationStat[];
  recommendations: string[];
}

export interface MetricsSummary {
  totalChecks: number;
  blocked: number;
  allowed: number;
  blockRate: number;
  hallucinationsDetected: number;
  avgConfidence: number;
  avgResponseTime: number;
}

export interface TrendData {
  dailyBlockRate: Array<{ date: string; rate: number }>;
  hourlyActivity: Array<{ hour: number; count: number }>;
  weeklyTrend: 'improving' | 'stable' | 'declining';
}

export interface ViolationStat {
  type: string;
  count: number;
  percentage: number;
  examples: string[];
}

export interface AnalyticsConfig {
  dataDirectory: string;
  retentionDays: number;
  aggregationInterval: 'hourly' | 'daily';
}

interface MetricsData {
  timestamp: Date;
  type: string;
  result: 'blocked' | 'allowed' | 'warning';
  hallucinationType?: string;
  confidence?: number;
  responseTime?: number;
  details?: Record<string, unknown>;
}

const DEFAULT_CONFIG: AnalyticsConfig = {
  dataDirectory: '.vibecheck/analytics',
  retentionDays: 30,
  aggregationInterval: 'daily',
};

export class HallucinationAnalytics {
  private config: AnalyticsConfig;
  private projectRoot: string;
  private metricsBuffer: MetricsData[] = [];

  constructor(projectRoot: string, config: Partial<AnalyticsConfig> = {}) {
    this.projectRoot = projectRoot;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Record a metric
   */
  async record(data: Omit<MetricsData, 'timestamp'>): Promise<void> {
    this.metricsBuffer.push({
      ...data,
      timestamp: new Date(),
    });

    // Persist when buffer is large
    if (this.metricsBuffer.length >= 50) {
      await this.persistMetrics();
    }
  }

  /**
   * Record a hallucination detection
   */
  async recordHallucination(
    type: string,
    details: {
      confidence: number;
      file?: string;
      claim?: string;
    }
  ): Promise<void> {
    await this.record({
      type: 'hallucination',
      result: 'blocked',
      hallucinationType: type,
      confidence: details.confidence,
      details,
    });
  }

  /**
   * Record a firewall check
   */
  async recordFirewallCheck(
    result: 'blocked' | 'allowed',
    responseTime: number,
    details?: Record<string, unknown>
  ): Promise<void> {
    await this.record({
      type: 'firewall',
      result,
      responseTime,
      details,
    });
  }

  /**
   * Generate an analytics report
   */
  async generateReport(
    startDate: Date,
    endDate: Date = new Date()
  ): Promise<AnalyticsReport> {
    // Persist any buffered metrics
    await this.persistMetrics();

    // Load metrics for the period
    const metrics = await this.loadMetrics(startDate, endDate);

    // Calculate summary
    const summary = this.calculateSummary(metrics);

    // Calculate trends
    const trends = this.calculateTrends(metrics);

    // Get top violations
    const topViolations = this.getTopViolations(metrics);

    // Generate recommendations
    const recommendations = this.generateRecommendations(summary, topViolations);

    return {
      period: { start: startDate, end: endDate },
      summary,
      trends,
      topViolations,
      recommendations,
    };
  }

  /**
   * Get current metrics summary
   */
  async getSummary(since?: Date): Promise<MetricsSummary> {
    const startDate = since || new Date(Date.now() - 24 * 60 * 60 * 1000);
    await this.persistMetrics();
    const metrics = await this.loadMetrics(startDate, new Date());
    return this.calculateSummary(metrics);
  }

  /**
   * Get hallucination breakdown by type
   */
  async getHallucinationBreakdown(since?: Date): Promise<Record<string, number>> {
    const startDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    await this.persistMetrics();
    const metrics = await this.loadMetrics(startDate, new Date());

    const breakdown: Record<string, number> = {};
    
    for (const m of metrics) {
      if (m.hallucinationType) {
        breakdown[m.hallucinationType] = (breakdown[m.hallucinationType] || 0) + 1;
      }
    }

    return breakdown;
  }

  /**
   * Persist buffered metrics to disk
   */
  private async persistMetrics(): Promise<void> {
    if (this.metricsBuffer.length === 0) return;

    const dataDir = path.join(this.projectRoot, this.config.dataDirectory);
    await fs.mkdir(dataDir, { recursive: true });

    const metrics = this.metricsBuffer.splice(0, this.metricsBuffer.length);
    const date = new Date().toISOString().split('T')[0];
    const filePath = path.join(dataDir, `metrics-${date}.jsonl`);

    const content = metrics.map(m => JSON.stringify(m)).join('\n') + '\n';
    await fs.appendFile(filePath, content, 'utf-8');
  }

  /**
   * Load metrics for a date range
   */
  private async loadMetrics(startDate: Date, endDate: Date): Promise<MetricsData[]> {
    const dataDir = path.join(this.projectRoot, this.config.dataDirectory);
    const metrics: MetricsData[] = [];

    try {
      const files = await fs.readdir(dataDir);
      const metricsFiles = files.filter(f => f.startsWith('metrics-') && f.endsWith('.jsonl'));

      for (const file of metricsFiles) {
        // Check if file is in date range
        const dateMatch = file.match(/metrics-(\d{4}-\d{2}-\d{2})\.jsonl/);
        if (!dateMatch) continue;

        const fileDate = new Date(dateMatch[1]);
        if (fileDate < startDate || fileDate > endDate) continue;

        const content = await fs.readFile(path.join(dataDir, file), 'utf-8');
        const lines = content.trim().split('\n').filter(l => l.length > 0);

        for (const line of lines) {
          try {
            const data = JSON.parse(line) as MetricsData;
            data.timestamp = new Date(data.timestamp);

            if (data.timestamp >= startDate && data.timestamp <= endDate) {
              metrics.push(data);
            }
          } catch {
            // Skip invalid lines
          }
        }
      }
    } catch {
      // Directory doesn't exist
    }

    // Also include buffered metrics
    for (const m of this.metricsBuffer) {
      if (m.timestamp >= startDate && m.timestamp <= endDate) {
        metrics.push(m);
      }
    }

    return metrics.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Calculate summary metrics
   */
  private calculateSummary(metrics: MetricsData[]): MetricsSummary {
    const totalChecks = metrics.length;
    const blocked = metrics.filter(m => m.result === 'blocked').length;
    const allowed = metrics.filter(m => m.result === 'allowed').length;
    const blockRate = totalChecks > 0 ? blocked / totalChecks : 0;

    const hallucinations = metrics.filter(m => m.type === 'hallucination');
    const confidences = hallucinations.filter(m => m.confidence).map(m => m.confidence!);
    const avgConfidence = confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0;

    const responseTimes = metrics.filter(m => m.responseTime).map(m => m.responseTime!);
    const avgResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

    return {
      totalChecks,
      blocked,
      allowed,
      blockRate,
      hallucinationsDetected: hallucinations.length,
      avgConfidence,
      avgResponseTime,
    };
  }

  /**
   * Calculate trend data
   */
  private calculateTrends(metrics: MetricsData[]): TrendData {
    // Daily block rate
    const dailyStats: Record<string, { blocked: number; total: number }> = {};
    
    for (const m of metrics) {
      const date = m.timestamp.toISOString().split('T')[0];
      if (!dailyStats[date]) {
        dailyStats[date] = { blocked: 0, total: 0 };
      }
      dailyStats[date].total++;
      if (m.result === 'blocked') {
        dailyStats[date].blocked++;
      }
    }

    const dailyBlockRate = Object.entries(dailyStats)
      .map(([date, stats]) => ({
        date,
        rate: stats.total > 0 ? stats.blocked / stats.total : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Hourly activity
    const hourlyCount: number[] = new Array(24).fill(0);
    for (const m of metrics) {
      hourlyCount[m.timestamp.getHours()]++;
    }
    const hourlyActivity = hourlyCount.map((count, hour) => ({ hour, count }));

    // Weekly trend
    let weeklyTrend: 'improving' | 'stable' | 'declining' = 'stable';
    if (dailyBlockRate.length >= 7) {
      const recentWeek = dailyBlockRate.slice(-7);
      const firstHalf = recentWeek.slice(0, 3).reduce((a, b) => a + b.rate, 0) / 3;
      const secondHalf = recentWeek.slice(-3).reduce((a, b) => a + b.rate, 0) / 3;
      
      if (secondHalf < firstHalf - 0.1) {
        weeklyTrend = 'improving';
      } else if (secondHalf > firstHalf + 0.1) {
        weeklyTrend = 'declining';
      }
    }

    return { dailyBlockRate, hourlyActivity, weeklyTrend };
  }

  /**
   * Get top violations
   */
  private getTopViolations(metrics: MetricsData[]): ViolationStat[] {
    const violations: Record<string, { count: number; examples: string[] }> = {};
    const blockedMetrics = metrics.filter(m => m.result === 'blocked');

    for (const m of blockedMetrics) {
      const type = m.hallucinationType || m.type;
      if (!violations[type]) {
        violations[type] = { count: 0, examples: [] };
      }
      violations[type].count++;

      if (violations[type].examples.length < 3 && m.details) {
        const example = JSON.stringify(m.details).slice(0, 100);
        violations[type].examples.push(example);
      }
    }

    const total = blockedMetrics.length || 1;
    
    return Object.entries(violations)
      .map(([type, data]) => ({
        type,
        count: data.count,
        percentage: (data.count / total) * 100,
        examples: data.examples,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  /**
   * Generate recommendations based on data
   */
  private generateRecommendations(
    summary: MetricsSummary,
    violations: ViolationStat[]
  ): string[] {
    const recommendations: string[] = [];

    // High block rate
    if (summary.blockRate > 0.5) {
      recommendations.push('High block rate detected. Consider reviewing coding guidelines with your team.');
    }

    // Slow response times
    if (summary.avgResponseTime > 1000) {
      recommendations.push('Average response time is high. Consider optimizing truthpack or enabling caching.');
    }

    // Top violations
    if (violations.length > 0) {
      const topViolation = violations[0];
      if (topViolation.percentage > 50) {
        recommendations.push(`${topViolation.type} accounts for ${topViolation.percentage.toFixed(1)}% of blocks. Consider adding specific guidance for this pattern.`);
      }
    }

    // Low confidence detections
    if (summary.avgConfidence > 0 && summary.avgConfidence < 0.7) {
      recommendations.push('Low average confidence in detections. Consider expanding the truthpack for better accuracy.');
    }

    if (recommendations.length === 0) {
      recommendations.push('System is performing well. Continue monitoring for changes.');
    }

    return recommendations;
  }
}
