/**
 * JUnit XML Formatter
 * 
 * Converts scan results to JUnit XML format for CI integration.
 */

export * from './types.js';
export { toJUnitReport, toJUnitXml } from './junit-formatter.js';
