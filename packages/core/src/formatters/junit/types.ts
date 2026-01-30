/**
 * JUnit Types
 * 
 * Type definitions for JUnit XML format.
 */

export interface JUnitTestSuite {
  /** Suite name */
  name: string;
  /** Number of tests */
  tests: number;
  /** Number of failures */
  failures: number;
  /** Number of errors */
  errors: number;
  /** Number of skipped tests */
  skipped: number;
  /** Total time in seconds */
  time: number;
  /** Timestamp */
  timestamp: string;
  /** Test cases */
  testcases: JUnitTestCase[];
  /** Suite properties */
  properties?: JUnitProperty[];
}

export interface JUnitTestCase {
  /** Test name */
  name: string;
  /** Class name (typically file path) */
  classname: string;
  /** Time in seconds */
  time: number;
  /** Failure information */
  failure?: JUnitFailure;
  /** Error information */
  error?: JUnitError;
  /** Whether test was skipped */
  skipped?: boolean;
  /** Skip message */
  skipMessage?: string;
  /** System output */
  systemOut?: string;
  /** System error */
  systemErr?: string;
}

export interface JUnitFailure {
  /** Failure message */
  message: string;
  /** Failure type */
  type: string;
  /** Detailed content */
  content?: string;
}

export interface JUnitError {
  /** Error message */
  message: string;
  /** Error type */
  type: string;
  /** Stack trace or details */
  content?: string;
}

export interface JUnitProperty {
  /** Property name */
  name: string;
  /** Property value */
  value: string;
}

export interface JUnitReport {
  /** Test suites */
  testsuites: JUnitTestSuite[];
  /** Total tests */
  tests: number;
  /** Total failures */
  failures: number;
  /** Total errors */
  errors: number;
  /** Total skipped */
  skipped: number;
  /** Total time */
  time: number;
  /** Report name */
  name?: string;
}

export interface JUnitOptions {
  /** Report name */
  name?: string;
  /** Include timestamps */
  includeTimestamp?: boolean;
  /** Include system output */
  includeOutput?: boolean;
  /** Group by file */
  groupByFile?: boolean;
  /** Pretty print XML */
  pretty?: boolean;
}

export const DEFAULT_JUNIT_OPTIONS: JUnitOptions = {
  name: 'VibeCheck Security Scan',
  includeTimestamp: true,
  includeOutput: false,
  groupByFile: true,
  pretty: true,
};
