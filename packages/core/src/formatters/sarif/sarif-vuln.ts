/**
 * SARIF Formatter for Vulnerability Findings
 * 
 * Converts vulnerability scan results to SARIF 2.1.0 format with:
 * - CVSS scores and vectors
 * - CWE identifiers
 * - Remediation paths
 * - Direct vs transitive classification
 */

import type {
  SarifDocument,
  SarifRule,
  SarifResult,
  SarifLevel,
  VulnerabilityScanResult,
  VulnerabilityFinding,
  VulnerabilityInfo,
  Ecosystem,
} from './types.js';

import {
  SARIF_SCHEMA,
  SARIF_VERSION,
  TOOL_NAME,
  TOOL_URI,
} from './types.js';

import { getToolVersion, normalizeFilePath } from './sarif-formatter.js';

// ============================================================================
// Ecosystem Mapping
// ============================================================================

/**
 * Get the manifest file for an ecosystem
 */
export function getManifestFile(ecosystem: Ecosystem): string {
  const manifestMap: Record<Ecosystem, string> = {
    npm: 'package.json',
    PyPI: 'requirements.txt',
    RubyGems: 'Gemfile',
    Go: 'go.mod',
    Maven: 'pom.xml',
    NuGet: 'packages.config',
    Cargo: 'Cargo.toml',
  };
  
  return manifestMap[ecosystem] ?? 'package.json';
}

// ============================================================================
// Severity Mapping
// ============================================================================

/**
 * Map vulnerability severity to SARIF level
 */
export function severityToLevel(severity: string): SarifLevel {
  switch (severity) {
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
 * Generate a unique fingerprint for vulnerability deduplication
 */
export function generateVulnFingerprint(
  vulnId: string,
  packageName: string,
  version: string
): string {
  return `${vulnId}:${packageName}:${version}`;
}

// ============================================================================
// Rule Building
// ============================================================================

/**
 * Build SARIF rules from vulnerability findings
 */
export function buildRulesFromVulnerabilities(
  findings: VulnerabilityFinding[]
): SarifRule[] {
  const ruleMap = new Map<string, SarifRule>();

  for (const finding of findings) {
    for (const vuln of finding.vulnerabilities) {
      if (!ruleMap.has(vuln.id)) {
        ruleMap.set(vuln.id, {
          id: vuln.id,
          name: vuln.title,
          shortDescription: { text: vuln.title },
          fullDescription: { 
            text: vuln.description ?? vuln.title 
          },
          helpUri: vuln.references[0] ?? 'https://osv.dev',
          defaultConfiguration: { 
            level: severityToLevel(vuln.severity) 
          },
          properties: {
            severity: vuln.severity,
            cvssScore: vuln.cvssScore,
            cvssVector: vuln.cvssVector,
            cwe: vuln.cwe,
            aliases: vuln.aliases,
            source: vuln.source,
          },
        });
      }
    }
  }

  return Array.from(ruleMap.values());
}

// ============================================================================
// Result Building
// ============================================================================

/**
 * Build remediation text from finding
 */
export function buildRemediationText(finding: VulnerabilityFinding): string {
  if (finding.remediationPath) {
    const breakingNote = finding.remediationPath.breakingChange 
      ? ' (Breaking change)' 
      : '';
    return `${finding.remediationPath.description}${breakingNote}`;
  }
  
  return `Upgrade to ${finding.recommendedVersion ?? 'latest'}`;
}

/**
 * Convert a vulnerability to a SARIF result
 */
export function vulnToSarifResult(
  finding: VulnerabilityFinding,
  vuln: VulnerabilityInfo,
  ecosystem: Ecosystem
): SarifResult {
  const remediationText = buildRemediationText(finding);
  
  return {
    ruleId: vuln.id,
    level: severityToLevel(vuln.severity),
    message: {
      text: `${vuln.title} in ${finding.package}@${finding.version}. ${remediationText}`,
    },
    locations: [{
      physicalLocation: {
        artifactLocation: {
          uri: getManifestFile(ecosystem),
          uriBaseId: '%SRCROOT%',
        },
        region: { startLine: 1 },
      },
    }],
    fingerprints: {
      'vibecheck/v1': generateVulnFingerprint(vuln.id, finding.package, finding.version),
      'osv/id': vuln.id,
    },
    properties: {
      package: finding.package,
      version: finding.version,
      ecosystem,
      isDirect: finding.isDirect,
      severity: vuln.severity,
      cvssScore: vuln.cvssScore,
      cvssVector: vuln.cvssVector,
      cwe: vuln.cwe,
      aliases: vuln.aliases,
      source: vuln.source,
      affectedVersions: vuln.affectedVersions,
      patchedVersions: vuln.patchedVersions,
      references: vuln.references,
      publishedAt: vuln.publishedAt,
      updatedAt: vuln.updatedAt,
      remediationPath: finding.remediationPath,
      recommendedVersion: finding.recommendedVersion,
    },
  };
}

// ============================================================================
// Main Formatter
// ============================================================================

/**
 * Convert vulnerability scan results to SARIF format
 */
export function toSarifVulnerabilities(
  results: VulnerabilityScanResult
): SarifDocument {
  const version = getToolVersion();
  const findings = results.findings ?? [];
  
  const rules = buildRulesFromVulnerabilities(findings);
  
  const sarifResults: SarifResult[] = [];
  for (const finding of findings) {
    for (const vuln of finding.vulnerabilities) {
      sarifResults.push(vulnToSarifResult(finding, vuln, results.ecosystem));
    }
  }
  
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

// ============================================================================
// Summary Helpers
// ============================================================================

/**
 * Count vulnerabilities by severity
 */
export function countBySeverity(
  results: VulnerabilityScanResult
): Record<string, number> {
  const counts: Record<string, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  for (const finding of results.findings) {
    for (const vuln of finding.vulnerabilities) {
      const severity = vuln.severity.toLowerCase();
      if (severity in counts) {
        counts[severity]++;
      }
    }
  }

  return counts;
}

/**
 * Get total vulnerability count
 */
export function getTotalVulnerabilityCount(
  results: VulnerabilityScanResult
): number {
  return results.findings.reduce(
    (total, finding) => total + finding.vulnerabilities.length,
    0
  );
}
