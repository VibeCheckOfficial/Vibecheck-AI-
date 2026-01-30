/**
 * Traffic Classifier
 * 
 * Classifies HTTP traffic as real, possibly fake, or likely fake.
 */

import type {
  HttpRequest,
  HttpResponse,
  TrafficClassification,
  Verdict,
  VerdictReason,
  DetectedPattern,
  ClassificationOptions,
  FakePattern,
} from './types.js';
import { VERDICT_LABELS } from './types.js';
import {
  ALL_FAKE_PATTERNS,
  matchesFakeDomain,
  matchesFakeResponse,
  countRealDataSignals,
} from './patterns.js';

// ============================================================================
// Default Options
// ============================================================================

const DEFAULT_OPTIONS: Required<ClassificationOptions> = {
  customPatterns: [],
  ignorePatterns: [],
  passThreshold: 60,
  warnThreshold: 90,
};

// ============================================================================
// Traffic Classifier Class
// ============================================================================

export class TrafficClassifier {
  private options: Required<ClassificationOptions>;
  private patterns: FakePattern[];

  constructor(options: ClassificationOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.patterns = [
      ...ALL_FAKE_PATTERNS,
      ...this.options.customPatterns,
    ].filter(p => !this.options.ignorePatterns.includes(p.id));
  }

  /**
   * Classify an HTTP request/response pair
   */
  classify(request: HttpRequest, response: HttpResponse): TrafficClassification {
    const reasons: VerdictReason[] = [];
    const detectedPatterns: DetectedPattern[] = [];
    let score = 100; // Start at 100, deduct for fake patterns

    // Check URL for fake domain patterns
    const domainMatch = matchesFakeDomain(request.url);
    if (domainMatch) {
      score += domainMatch.scoreImpact;
      reasons.push({
        type: 'fake_domain',
        description: `URL matches ${domainMatch.name} pattern`,
        severity: domainMatch.severity,
        scoreImpact: domainMatch.scoreImpact,
      });
      detectedPatterns.push({
        name: domainMatch.name,
        category: 'domain',
        matched: request.url,
        location: 'url',
      });
    }

    // Check response body for fake patterns
    if (response.body) {
      const responseMatches = matchesFakeResponse(response.body);
      for (const match of responseMatches) {
        score += match.scoreImpact;
        reasons.push({
          type: 'fake_response',
          description: `Response contains ${match.name}`,
          severity: match.severity,
          scoreImpact: match.scoreImpact,
        });
        detectedPatterns.push({
          name: match.name,
          category: 'response',
          matched: this.extractMatch(response.body, match.pattern),
          location: 'body',
        });
      }

      // Check for real data signals (boost score)
      const boost = countRealDataSignals(response.body);
      if (boost > 0) {
        score = Math.min(100, score + boost);
      }

      // Check for empty or minimal response
      if (response.body.length < 10) {
        score -= 10;
        reasons.push({
          type: 'missing_data',
          description: 'Response body is very short',
          severity: 'info',
          scoreImpact: -10,
        });
      }

      // Check for generic success responses
      if (/^\s*\{\s*"success"\s*:\s*true\s*\}\s*$/i.test(response.body)) {
        score -= 20;
        reasons.push({
          type: 'generic_success',
          description: 'Response is a generic success object',
          severity: 'warning',
          scoreImpact: -20,
        });
      }
    }

    // Check for error status codes
    if (response.status >= 400) {
      score -= 5;
      reasons.push({
        type: 'api_error',
        description: `API returned error status: ${response.status}`,
        severity: 'info',
        scoreImpact: -5,
      });
    }

    // Clamp score to 0-100
    score = Math.max(0, Math.min(100, score));

    // Determine verdict
    const verdict = this.getVerdict(score);

    return {
      verdict,
      score,
      reasons,
      detectedPatterns,
    };
  }

  /**
   * Classify just a URL
   */
  classifyUrl(url: string): TrafficClassification {
    return this.classify(
      { url, method: 'GET' },
      { status: 200 }
    );
  }

  /**
   * Classify just a response body
   */
  classifyResponse(body: string): TrafficClassification {
    return this.classify(
      { url: '', method: 'GET' },
      { status: 200, body }
    );
  }

  /**
   * Get verdict from score
   */
  private getVerdict(score: number): Verdict {
    if (score >= this.options.warnThreshold) {
      return 'green';
    }
    if (score >= this.options.passThreshold) {
      return 'yellow';
    }
    return 'red';
  }

  /**
   * Extract matching portion from text
   */
  private extractMatch(text: string, pattern: RegExp): string {
    const match = text.match(pattern);
    return match ? match[0].substring(0, 100) : '';
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Classify traffic with default options
 */
export function classifyTraffic(
  request: HttpRequest,
  response: HttpResponse,
  options?: ClassificationOptions
): TrafficClassification {
  const classifier = new TrafficClassifier(options);
  return classifier.classify(request, response);
}

/**
 * Quick check if URL is likely fake
 */
export function isLikelyFakeUrl(url: string): boolean {
  const result = new TrafficClassifier().classifyUrl(url);
  return result.verdict === 'red';
}

/**
 * Quick check if response is likely fake
 */
export function isLikelyFakeResponse(body: string): boolean {
  const result = new TrafficClassifier().classifyResponse(body);
  return result.verdict === 'red';
}

// ============================================================================
// Display Helpers
// ============================================================================

/**
 * Format classification result for display
 */
export function formatClassification(result: TrafficClassification): string {
  const lines = [
    `Verdict: ${VERDICT_LABELS[result.verdict]} (${result.verdict.toUpperCase()})`,
    `Score: ${result.score}/100`,
    '',
  ];

  if (result.reasons.length > 0) {
    lines.push('Reasons:');
    for (const reason of result.reasons) {
      const icon = reason.severity === 'critical' ? '🔴' :
                   reason.severity === 'warning' ? '🟡' : '🔵';
      lines.push(`  ${icon} ${reason.description}`);
    }
  }

  if (result.detectedPatterns.length > 0) {
    lines.push('', 'Detected Patterns:');
    for (const pattern of result.detectedPatterns) {
      lines.push(`  - ${pattern.name}: ${pattern.matched.substring(0, 50)}`);
    }
  }

  return lines.join('\n');
}

/**
 * Get verdict emoji
 */
export function getVerdictEmoji(verdict: Verdict): string {
  switch (verdict) {
    case 'green': return '✅';
    case 'yellow': return '⚠️';
    case 'red': return '❌';
  }
}
