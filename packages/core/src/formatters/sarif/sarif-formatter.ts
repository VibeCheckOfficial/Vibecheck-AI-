/**
 * SARIF Formatter for Secret Findings
 * 
 * Converts secret scan results to SARIF 2.1.0 format for GitHub Code Scanning.
 */

import type {
  SarifDocument,
  SarifRule,
  SarifResult,
  SarifLevel,
  SecretScanResult,
  SecretFinding,
} from './types.js';

import {
  SARIF_SCHEMA,
  SARIF_VERSION,
  TOOL_NAME,
  TOOL_URI,
} from './types.js';

// ============================================================================
// Version
// ============================================================================

const PACKAGE_VERSION = '1.0.0';

/**
 * Get the tool version
 */
export function getToolVersion(): string {
  return PACKAGE_VERSION;
}

// ============================================================================
// Severity Mapping
// ============================================================================

/**
 * Map risk level to SARIF level
 */
export function riskToLevel(risk: string): SarifLevel {
  switch (risk) {
    case 'critical':
    case 'high':
      return 'error';
    case 'medium':
      return 'warning';
    case 'low':
      return 'note';
    default:
      return 'warning';
  }
}

// ============================================================================
// Fingerprint Generation
// ============================================================================

/**
 * Generate a unique fingerprint for deduplication
 */
export function generateFingerprint(finding: SecretFinding): string {
  return `${finding.type}:${finding.file}:${finding.line}`;
}

// ============================================================================
// Rule Building
// ============================================================================

/**
 * Build rule ID from finding type
 */
export function buildRuleId(type: string): string {
  return type;
}

/**
 * Build human-readable rule name from type
 */
export function buildRuleName(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c: string) => c.toUpperCase());
}

/**
 * Build rules from findings
 */
export function buildRulesFromFindings(findings: SecretFinding[]): SarifRule[] {
  const ruleMap = new Map<string, SarifRule>();

  for (const finding of findings) {
    if (!ruleMap.has(finding.type)) {
      ruleMap.set(finding.type, {
        id: buildRuleId(finding.type),
        name: buildRuleName(finding.type),
        shortDescription: { 
          text: `Detected ${finding.type.replace(/_/g, ' ')}` 
        },
        fullDescription: { 
          text: finding.recommendation?.reason ?? 
                `Potential ${finding.type.replace(/_/g, ' ')} detected in source code` 
        },
        helpUri: `${TOOL_URI}/docs/secrets`,
        defaultConfiguration: { 
          level: riskToLevel(finding.risk) 
        },
      });
    }
  }

  return Array.from(ruleMap.values());
}

// ============================================================================
// Result Building
// ============================================================================

/**
 * Normalize file path for SARIF (forward slashes)
 */
export function normalizeFilePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

/**
 * Convert a secret finding to a SARIF result
 */
export function findingToSarifResult(finding: SecretFinding): SarifResult {
  const testSuffix = finding.isTest ? ' (in test file)' : '';
  
  return {
    ruleId: finding.type,
    level: riskToLevel(finding.risk),
    message: {
      text: `${finding.type}: ${finding.match}${testSuffix}`,
    },
    locations: [{
      physicalLocation: {
        artifactLocation: {
          uri: normalizeFilePath(finding.file),
          uriBaseId: '%SRCROOT%',
        },
        region: {
          startLine: finding.line,
          startColumn: 1,
        },
      },
    }],
    fingerprints: {
      'vibecheck/v1': generateFingerprint(finding),
    },
    properties: {
      confidence: finding.confidence,
      entropy: finding.entropy,
      isTest: finding.isTest,
      remediation: finding.recommendation?.remediation,
    },
  };
}

// ============================================================================
// Main Formatter
// ============================================================================

/**
 * Convert secret scan results to SARIF format
 */
export function toSarif(results: SecretScanResult): SarifDocument {
  const version = getToolVersion();
  const findings = results.findings ?? [];
  
  const rules = buildRulesFromFindings(findings);
  const sarifResults = findings.map(findingToSarifResult);
  
  return {
    $schema: SARIF_SCHEMA,
    version: SARIF_VERSION,
    runs: [{
      tool: {
        driver: {
          name: TOOL_NAME,
          version,
          informationUri: TOOL_URI,
          rules,
        },
      },
      results: sarifResults,
      invocations: [{
        executionSuccessful: true,
        startTimeUtc: new Date().toISOString(),
        workingDirectory: results.projectPath 
          ? { uri: normalizeFilePath(results.projectPath) }
          : undefined,
      }],
    }],
  };
}

/**
 * Serialize SARIF document to JSON string
 */
export function sarifToJson(sarif: SarifDocument, pretty = true): string {
  return pretty 
    ? JSON.stringify(sarif, null, 2)
    : JSON.stringify(sarif);
}
