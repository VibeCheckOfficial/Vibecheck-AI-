/**
 * SARIF 2.1.0 Type Definitions
 * 
 * Standard format for GitHub/Azure DevOps security integration
 * @see https://sarifweb.azurewebsites.net/
 * @see https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
 */

// ============================================================================
// Core SARIF Types
// ============================================================================

export interface SarifDocument {
  $schema: string;
  version: '2.1.0';
  runs: SarifRun[];
}

export interface SarifRun {
  tool: SarifTool;
  results: SarifResult[];
  invocations: SarifInvocation[];
}

export interface SarifTool {
  driver: SarifToolComponent;
}

export interface SarifToolComponent {
  name: string;
  version: string;
  informationUri: string;
  rules: SarifRule[];
}

// ============================================================================
// Rule Definition
// ============================================================================

export interface SarifRule {
  id: string;
  name: string;
  shortDescription: SarifMessage;
  fullDescription?: SarifMessage;
  helpUri?: string;
  defaultConfiguration: SarifRuleConfiguration;
  properties?: SarifRuleProperties;
}

export interface SarifRuleConfiguration {
  level: SarifLevel;
}

export interface SarifRuleProperties {
  severity?: string;
  cvssScore?: number;
  cvssVector?: string;
  cwe?: string[];
  aliases?: string[];
  source?: string;
  [key: string]: unknown;
}

// ============================================================================
// Result/Finding
// ============================================================================

export interface SarifResult {
  ruleId: string;
  level: SarifLevel;
  message: SarifMessage;
  locations: SarifLocation[];
  fingerprints?: SarifFingerprints;
  properties?: SarifResultProperties;
}

export interface SarifMessage {
  text: string;
  markdown?: string;
}

export interface SarifFingerprints {
  'vibecheck/v1': string;
  'osv/id'?: string;
  [key: string]: string | undefined;
}

export interface SarifResultProperties {
  confidence?: number;
  entropy?: number;
  isTest?: boolean;
  remediation?: string;
  // Vulnerability-specific
  package?: string;
  version?: string;
  ecosystem?: string;
  isDirect?: boolean;
  severity?: string;
  cvssScore?: number;
  cvssVector?: string;
  cwe?: string[];
  aliases?: string[];
  source?: string;
  affectedVersions?: string[];
  patchedVersions?: string[];
  references?: string[];
  publishedAt?: string;
  updatedAt?: string;
  remediationPath?: RemediationPath;
  recommendedVersion?: string;
  [key: string]: unknown;
}

export interface RemediationPath {
  description: string;
  breakingChange?: boolean;
}

// ============================================================================
// Location
// ============================================================================

export interface SarifLocation {
  physicalLocation: SarifPhysicalLocation;
}

export interface SarifPhysicalLocation {
  artifactLocation: SarifArtifactLocation;
  region?: SarifRegion;
}

export interface SarifArtifactLocation {
  uri: string;
  uriBaseId?: string;
}

export interface SarifRegion {
  startLine: number;
  startColumn?: number;
  endLine?: number;
  endColumn?: number;
}

// ============================================================================
// Invocation
// ============================================================================

export interface SarifInvocation {
  executionSuccessful: boolean;
  commandLine?: string;
  startTimeUtc?: string;
  endTimeUtc?: string;
  workingDirectory?: SarifWorkingDirectory;
}

export interface SarifWorkingDirectory {
  uri: string;
}

// ============================================================================
// Level/Severity
// ============================================================================

export type SarifLevel = 'error' | 'warning' | 'note' | 'none';

// ============================================================================
// Input Types (from scan results)
// ============================================================================

export interface SecretFinding {
  type: string;
  risk: 'high' | 'medium' | 'low';
  match: string;
  file: string;
  line: number;
  confidence?: number;
  entropy?: number;
  isTest?: boolean;
  recommendation?: {
    reason?: string;
    remediation?: string;
  };
}

export interface SecretScanResult {
  projectPath?: string;
  findings: SecretFinding[];
}

export interface VulnerabilityInfo {
  id: string;
  title: string;
  description?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  cvssScore?: number;
  cvssVector?: string;
  cwe?: string[];
  aliases?: string[];
  source?: string;
  affectedVersions?: string[];
  patchedVersions?: string[];
  references: string[];
  publishedAt?: string;
  updatedAt?: string;
}

export interface VulnerabilityFinding {
  package: string;
  version: string;
  isDirect?: boolean;
  vulnerabilities: VulnerabilityInfo[];
  recommendedVersion?: string;
  remediationPath?: RemediationPath;
}

export type Ecosystem = 'npm' | 'PyPI' | 'RubyGems' | 'Go' | 'Maven' | 'NuGet' | 'Cargo';

export interface VulnerabilityScanResult {
  projectPath?: string;
  ecosystem: Ecosystem;
  findings: VulnerabilityFinding[];
}

// ============================================================================
// Constants
// ============================================================================

export const SARIF_SCHEMA = 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json';
export const SARIF_VERSION = '2.1.0' as const;
export const TOOL_NAME = 'vibecheck';
export const TOOL_URI = 'https://vibecheckai.dev';
