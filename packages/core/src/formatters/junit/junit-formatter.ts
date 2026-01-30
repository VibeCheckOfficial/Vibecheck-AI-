/**
 * JUnit XML Formatter
 * 
 * Converts scan results to JUnit XML format for CI integration.
 */

import type {
  JUnitTestSuite,
  JUnitTestCase,
  JUnitFailure,
  JUnitReport,
  JUnitOptions,
  JUnitProperty,
} from './types.js';
import { DEFAULT_JUNIT_OPTIONS } from './types.js';

interface Finding {
  ruleId: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  file: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

interface ScanResult {
  findings: Finding[];
  filesScanned: number;
  durationMs: number;
  projectName?: string;
}

/**
 * Convert scan results to JUnit report structure
 */
export function toJUnitReport(
  result: ScanResult,
  options: JUnitOptions = {}
): JUnitReport {
  const opts = { ...DEFAULT_JUNIT_OPTIONS, ...options };
  const timestamp = new Date().toISOString();
  const timeSeconds = result.durationMs / 1000;

  if (opts.groupByFile) {
    return createGroupedReport(result, opts, timestamp, timeSeconds);
  }

  return createFlatReport(result, opts, timestamp, timeSeconds);
}

/**
 * Convert scan results directly to JUnit XML string
 */
export function toJUnitXml(
  result: ScanResult,
  options: JUnitOptions = {}
): string {
  const report = toJUnitReport(result, options);
  return serializeReport(report, options.pretty ?? true);
}

function createGroupedReport(
  result: ScanResult,
  opts: JUnitOptions,
  timestamp: string,
  timeSeconds: number
): JUnitReport {
  // Group findings by file
  const byFile = new Map<string, Finding[]>();
  
  for (const finding of result.findings) {
    const existing = byFile.get(finding.file) ?? [];
    existing.push(finding);
    byFile.set(finding.file, existing);
  }

  const testsuites: JUnitTestSuite[] = [];
  let totalFailures = 0;
  let totalErrors = 0;

  for (const [file, findings] of byFile) {
    const { failures, errors } = countByType(findings);
    totalFailures += failures;
    totalErrors += errors;

    const suite: JUnitTestSuite = {
      name: file,
      tests: findings.length,
      failures,
      errors,
      skipped: 0,
      time: 0,
      timestamp,
      testcases: findings.map((f) => findingToTestCase(f, opts)),
    };

    testsuites.push(suite);
  }

  return {
    testsuites,
    tests: result.findings.length,
    failures: totalFailures,
    errors: totalErrors,
    skipped: 0,
    time: timeSeconds,
    name: opts.name,
  };
}

function createFlatReport(
  result: ScanResult,
  opts: JUnitOptions,
  timestamp: string,
  timeSeconds: number
): JUnitReport {
  const { failures, errors } = countByType(result.findings);

  const suite: JUnitTestSuite = {
    name: opts.name ?? 'VibeCheck',
    tests: result.findings.length,
    failures,
    errors,
    skipped: 0,
    time: timeSeconds,
    timestamp,
    testcases: result.findings.map((f) => findingToTestCase(f, opts)),
  };

  return {
    testsuites: [suite],
    tests: result.findings.length,
    failures,
    errors,
    skipped: 0,
    time: timeSeconds,
    name: opts.name,
  };
}

function findingToTestCase(finding: Finding, opts: JUnitOptions): JUnitTestCase {
  const location = finding.line 
    ? `${finding.file}:${finding.line}${finding.column ? `:${finding.column}` : ''}`
    : finding.file;

  const testcase: JUnitTestCase = {
    name: `[${finding.ruleId}] ${location}`,
    classname: finding.file.replace(/\//g, '.').replace(/\\/g, '.'),
    time: 0,
  };

  // Errors are severity: error, failures are warnings
  if (finding.severity === 'error') {
    testcase.failure = {
      message: finding.message,
      type: finding.ruleId,
      content: formatFailureContent(finding),
    };
  } else if (finding.severity === 'warning') {
    testcase.failure = {
      message: finding.message,
      type: finding.ruleId,
      content: formatFailureContent(finding),
    };
  }

  // Info level findings can be skipped or shown as passed
  if (finding.severity === 'info') {
    testcase.systemOut = finding.message;
  }

  return testcase;
}

function formatFailureContent(finding: Finding): string {
  const parts: string[] = [
    `Rule: ${finding.ruleId}`,
    `File: ${finding.file}`,
  ];

  if (finding.line) {
    parts.push(`Line: ${finding.line}`);
  }
  if (finding.column) {
    parts.push(`Column: ${finding.column}`);
  }

  parts.push('', finding.message);

  if (finding.suggestion) {
    parts.push('', `Suggestion: ${finding.suggestion}`);
  }

  return parts.join('\n');
}

function countByType(findings: Finding[]): { failures: number; errors: number } {
  let failures = 0;
  let errors = 0;

  for (const finding of findings) {
    if (finding.severity === 'error') {
      errors++;
    } else if (finding.severity === 'warning') {
      failures++;
    }
  }

  return { failures, errors };
}

function serializeReport(report: JUnitReport, pretty: boolean): string {
  const indent = pretty ? '  ' : '';
  const newline = pretty ? '\n' : '';

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
  ];

  // Root testsuites element
  const rootAttrs = [
    `name="${escapeXml(report.name ?? 'VibeCheck')}"`,
    `tests="${report.tests}"`,
    `failures="${report.failures}"`,
    `errors="${report.errors}"`,
    `skipped="${report.skipped}"`,
    `time="${report.time.toFixed(3)}"`,
  ].join(' ');

  lines.push(`<testsuites ${rootAttrs}>${newline}`);

  // Test suites
  for (const suite of report.testsuites) {
    const suiteAttrs = [
      `name="${escapeXml(suite.name)}"`,
      `tests="${suite.tests}"`,
      `failures="${suite.failures}"`,
      `errors="${suite.errors}"`,
      `skipped="${suite.skipped}"`,
      `time="${suite.time.toFixed(3)}"`,
      `timestamp="${suite.timestamp}"`,
    ].join(' ');

    lines.push(`${indent}<testsuite ${suiteAttrs}>${newline}`);

    // Properties
    if (suite.properties && suite.properties.length > 0) {
      lines.push(`${indent}${indent}<properties>${newline}`);
      for (const prop of suite.properties) {
        lines.push(`${indent}${indent}${indent}<property name="${escapeXml(prop.name)}" value="${escapeXml(prop.value)}"/>${newline}`);
      }
      lines.push(`${indent}${indent}</properties>${newline}`);
    }

    // Test cases
    for (const testcase of suite.testcases) {
      const tcAttrs = [
        `name="${escapeXml(testcase.name)}"`,
        `classname="${escapeXml(testcase.classname)}"`,
        `time="${testcase.time.toFixed(3)}"`,
      ].join(' ');

      if (!testcase.failure && !testcase.error && !testcase.skipped) {
        lines.push(`${indent}${indent}<testcase ${tcAttrs}/>${newline}`);
        continue;
      }

      lines.push(`${indent}${indent}<testcase ${tcAttrs}>${newline}`);

      if (testcase.failure) {
        lines.push(`${indent}${indent}${indent}<failure message="${escapeXml(testcase.failure.message)}" type="${escapeXml(testcase.failure.type)}">${newline}`);
        if (testcase.failure.content) {
          lines.push(`${escapeXml(testcase.failure.content)}${newline}`);
        }
        lines.push(`${indent}${indent}${indent}</failure>${newline}`);
      }

      if (testcase.error) {
        lines.push(`${indent}${indent}${indent}<error message="${escapeXml(testcase.error.message)}" type="${escapeXml(testcase.error.type)}">${newline}`);
        if (testcase.error.content) {
          lines.push(`${escapeXml(testcase.error.content)}${newline}`);
        }
        lines.push(`${indent}${indent}${indent}</error>${newline}`);
      }

      if (testcase.skipped) {
        if (testcase.skipMessage) {
          lines.push(`${indent}${indent}${indent}<skipped message="${escapeXml(testcase.skipMessage)}"/>${newline}`);
        } else {
          lines.push(`${indent}${indent}${indent}<skipped/>${newline}`);
        }
      }

      if (testcase.systemOut) {
        lines.push(`${indent}${indent}${indent}<system-out><![CDATA[${testcase.systemOut}]]></system-out>${newline}`);
      }

      if (testcase.systemErr) {
        lines.push(`${indent}${indent}${indent}<system-err><![CDATA[${testcase.systemErr}]]></system-err>${newline}`);
      }

      lines.push(`${indent}${indent}</testcase>${newline}`);
    }

    lines.push(`${indent}</testsuite>${newline}`);
  }

  lines.push('</testsuites>');

  return lines.join('');
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
