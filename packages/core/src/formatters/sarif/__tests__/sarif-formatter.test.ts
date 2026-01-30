/**
 * SARIF Formatter Tests
 */

import { describe, it, expect } from 'vitest';
import {
  toSarif,
  riskToLevel,
  generateFingerprint,
  buildRuleName,
  normalizeFilePath,
  sarifToJson,
} from '../sarif-formatter.js';
import {
  toSarifVulnerabilities,
  severityToLevel,
  getManifestFile,
  countBySeverity,
  getTotalVulnerabilityCount,
} from '../sarif-vuln.js';
import type { SecretScanResult, VulnerabilityScanResult } from '../types.js';

describe('SARIF Formatter', () => {
  describe('riskToLevel', () => {
    it('maps high risk to error', () => {
      expect(riskToLevel('high')).toBe('error');
      expect(riskToLevel('critical')).toBe('error');
    });

    it('maps medium risk to warning', () => {
      expect(riskToLevel('medium')).toBe('warning');
    });

    it('maps low risk to note', () => {
      expect(riskToLevel('low')).toBe('note');
    });

    it('defaults to warning for unknown risks', () => {
      expect(riskToLevel('unknown')).toBe('warning');
    });
  });

  describe('generateFingerprint', () => {
    it('creates unique fingerprint from finding', () => {
      const finding = {
        type: 'aws_access_key',
        file: 'src/config.ts',
        line: 42,
        risk: 'high' as const,
        match: 'AKIA...',
      };
      
      expect(generateFingerprint(finding)).toBe('aws_access_key:src/config.ts:42');
    });
  });

  describe('buildRuleName', () => {
    it('converts snake_case to Title Case', () => {
      expect(buildRuleName('aws_access_key')).toBe('Aws Access Key');
      expect(buildRuleName('github_token')).toBe('Github Token');
    });
  });

  describe('normalizeFilePath', () => {
    it('converts backslashes to forward slashes', () => {
      expect(normalizeFilePath('src\\config\\secrets.ts')).toBe('src/config/secrets.ts');
    });

    it('leaves forward slashes unchanged', () => {
      expect(normalizeFilePath('src/config/secrets.ts')).toBe('src/config/secrets.ts');
    });
  });

  describe('toSarif', () => {
    it('generates valid SARIF document for empty results', () => {
      const results: SecretScanResult = {
        projectPath: '/project',
        findings: [],
      };

      const sarif = toSarif(results);

      expect(sarif.$schema).toContain('sarif-schema-2.1.0');
      expect(sarif.version).toBe('2.1.0');
      expect(sarif.runs).toHaveLength(1);
      expect(sarif.runs[0].results).toHaveLength(0);
      expect(sarif.runs[0].tool.driver.name).toBe('vibecheck');
    });

    it('generates SARIF document with findings', () => {
      const results: SecretScanResult = {
        projectPath: '/project',
        findings: [
          {
            type: 'aws_access_key',
            risk: 'high',
            match: 'AKIAIOSFODNN7EXAMPLE',
            file: 'src/config.ts',
            line: 10,
            confidence: 0.95,
            entropy: 4.5,
            isTest: false,
          },
          {
            type: 'github_token',
            risk: 'high',
            match: 'ghp_xxx',
            file: 'src/api.ts',
            line: 25,
            isTest: true,
          },
        ],
      };

      const sarif = toSarif(results);

      expect(sarif.runs[0].results).toHaveLength(2);
      expect(sarif.runs[0].tool.driver.rules).toHaveLength(2);

      // Check first result
      const firstResult = sarif.runs[0].results[0];
      expect(firstResult.ruleId).toBe('aws_access_key');
      expect(firstResult.level).toBe('error');
      expect(firstResult.fingerprints?.['vibecheck/v1']).toBe('aws_access_key:src/config.ts:10');
      expect(firstResult.properties?.isTest).toBe(false);

      // Check second result (test file)
      const secondResult = sarif.runs[0].results[1];
      expect(secondResult.message.text).toContain('(in test file)');
      expect(secondResult.properties?.isTest).toBe(true);
    });

    it('deduplicates rules for same finding type', () => {
      const results: SecretScanResult = {
        findings: [
          { type: 'aws_access_key', risk: 'high', match: 'key1', file: 'a.ts', line: 1 },
          { type: 'aws_access_key', risk: 'high', match: 'key2', file: 'b.ts', line: 2 },
        ],
      };

      const sarif = toSarif(results);

      expect(sarif.runs[0].results).toHaveLength(2);
      expect(sarif.runs[0].tool.driver.rules).toHaveLength(1);
    });
  });

  describe('sarifToJson', () => {
    it('serializes to pretty JSON by default', () => {
      const results: SecretScanResult = { findings: [] };
      const sarif = toSarif(results);
      const json = sarifToJson(sarif);

      expect(json).toContain('\n');
      expect(json).toContain('  ');
    });

    it('serializes to compact JSON when pretty is false', () => {
      const results: SecretScanResult = { findings: [] };
      const sarif = toSarif(results);
      const json = sarifToJson(sarif, false);

      expect(json).not.toContain('\n  ');
    });
  });
});

describe('SARIF Vulnerability Formatter', () => {
  describe('severityToLevel', () => {
    it('maps critical/high to error', () => {
      expect(severityToLevel('critical')).toBe('error');
      expect(severityToLevel('high')).toBe('error');
    });

    it('maps medium to warning', () => {
      expect(severityToLevel('medium')).toBe('warning');
    });

    it('maps low to note', () => {
      expect(severityToLevel('low')).toBe('note');
    });
  });

  describe('getManifestFile', () => {
    it('returns correct manifest for each ecosystem', () => {
      expect(getManifestFile('npm')).toBe('package.json');
      expect(getManifestFile('PyPI')).toBe('requirements.txt');
      expect(getManifestFile('RubyGems')).toBe('Gemfile');
      expect(getManifestFile('Go')).toBe('go.mod');
      expect(getManifestFile('Maven')).toBe('pom.xml');
      expect(getManifestFile('Cargo')).toBe('Cargo.toml');
    });
  });

  describe('toSarifVulnerabilities', () => {
    it('generates valid SARIF for vulnerability findings', () => {
      const results: VulnerabilityScanResult = {
        projectPath: '/project',
        ecosystem: 'npm',
        findings: [
          {
            package: 'lodash',
            version: '4.17.20',
            isDirect: true,
            vulnerabilities: [
              {
                id: 'GHSA-xxxx-xxxx-xxxx',
                title: 'Prototype Pollution',
                severity: 'high',
                references: ['https://github.com/advisories/GHSA-xxxx'],
              },
            ],
            recommendedVersion: '4.17.21',
          },
        ],
      };

      const sarif = toSarifVulnerabilities(results);

      expect(sarif.runs[0].results).toHaveLength(1);
      expect(sarif.runs[0].results[0].ruleId).toBe('GHSA-xxxx-xxxx-xxxx');
      expect(sarif.runs[0].results[0].level).toBe('error');
      expect(sarif.runs[0].results[0].fingerprints?.['osv/id']).toBe('GHSA-xxxx-xxxx-xxxx');
      expect(sarif.runs[0].results[0].properties?.isDirect).toBe(true);
    });

    it('includes CVSS scores in properties', () => {
      const results: VulnerabilityScanResult = {
        ecosystem: 'npm',
        findings: [
          {
            package: 'test-pkg',
            version: '1.0.0',
            vulnerabilities: [
              {
                id: 'CVE-2024-1234',
                title: 'Test Vuln',
                severity: 'critical',
                cvssScore: 9.8,
                cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
                references: [],
              },
            ],
          },
        ],
      };

      const sarif = toSarifVulnerabilities(results);
      const result = sarif.runs[0].results[0];

      expect(result.properties?.cvssScore).toBe(9.8);
      expect(result.properties?.cvssVector).toContain('CVSS:3.1');
    });
  });

  describe('countBySeverity', () => {
    it('counts vulnerabilities by severity level', () => {
      const results: VulnerabilityScanResult = {
        ecosystem: 'npm',
        findings: [
          {
            package: 'pkg1',
            version: '1.0.0',
            vulnerabilities: [
              { id: 'v1', title: 'V1', severity: 'critical', references: [] },
              { id: 'v2', title: 'V2', severity: 'high', references: [] },
            ],
          },
          {
            package: 'pkg2',
            version: '2.0.0',
            vulnerabilities: [
              { id: 'v3', title: 'V3', severity: 'medium', references: [] },
              { id: 'v4', title: 'V4', severity: 'low', references: [] },
              { id: 'v5', title: 'V5', severity: 'low', references: [] },
            ],
          },
        ],
      };

      const counts = countBySeverity(results);

      expect(counts.critical).toBe(1);
      expect(counts.high).toBe(1);
      expect(counts.medium).toBe(1);
      expect(counts.low).toBe(2);
    });
  });

  describe('getTotalVulnerabilityCount', () => {
    it('returns total count of all vulnerabilities', () => {
      const results: VulnerabilityScanResult = {
        ecosystem: 'npm',
        findings: [
          {
            package: 'pkg1',
            version: '1.0.0',
            vulnerabilities: [
              { id: 'v1', title: 'V1', severity: 'high', references: [] },
              { id: 'v2', title: 'V2', severity: 'medium', references: [] },
            ],
          },
          {
            package: 'pkg2',
            version: '2.0.0',
            vulnerabilities: [
              { id: 'v3', title: 'V3', severity: 'low', references: [] },
            ],
          },
        ],
      };

      expect(getTotalVulnerabilityCount(results)).toBe(3);
    });
  });
});
