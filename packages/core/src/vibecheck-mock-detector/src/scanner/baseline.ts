// src/scanner/baseline.ts

import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import type { ScanResult, Finding } from './engines/mock-detector/types';

export interface BaselineEntry {
  hash: string;
  ruleId: string;
  file: string;
  line: number;
  code: string;
  severity: string;
  category: string;
  addedAt: string;
  addedBy?: string;
  reason?: string;
}

export interface Baseline {
  version: string;
  createdAt: string;
  updatedAt: string;
  project?: string;
  entries: BaselineEntry[];
  metadata: {
    totalFindings: number;
    bySeverity: Record<string, number>;
    generatedFrom?: string;
  };
}

export function generateFindingHash(finding: Finding): string {
  const normalizedCode = finding.code
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 200);

  const content = `${finding.id}:${finding.file}:${normalizedCode}`;
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

export async function createBaseline(
  scanResult: ScanResult,
  options: {
    outputPath: string;
    project?: string;
    reason?: string;
    addedBy?: string;
    commit?: string;
  }
): Promise<Baseline> {
  const now = new Date().toISOString();

  const entries: BaselineEntry[] = scanResult.findings.map(finding => ({
    hash: generateFindingHash(finding),
    ruleId: finding.id,
    file: finding.file,
    line: finding.line,
    code: finding.code.slice(0, 200),
    severity: finding.severity,
    category: finding.category,
    addedAt: now,
    addedBy: options.addedBy,
    reason: options.reason,
  }));

  const baseline: Baseline = {
    version: '1.0',
    createdAt: now,
    updatedAt: now,
    project: options.project,
    entries,
    metadata: {
      totalFindings: scanResult.summary.total,
      bySeverity: scanResult.summary.bySeverity,
      generatedFrom: options.commit,
    },
  };

  await fs.writeFile(options.outputPath, JSON.stringify(baseline, null, 2));

  return baseline;
}

export async function loadBaseline(baselinePath: string): Promise<Baseline | null> {
  try {
    const content = await fs.readFile(baselinePath, 'utf-8');
    return JSON.parse(content) as Baseline;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export function filterBaselineFindings(
  scanResult: ScanResult,
  baseline: Baseline,
  packageName?: string
): ScanResult {
  const baselineHashes = new Set(baseline.entries.map(e => e.hash));

  const baselineLookup = new Map<string, BaselineEntry[]>();
  for (const entry of baseline.entries) {
    const key = `${entry.file}:${entry.ruleId}`;
    if (!baselineLookup.has(key)) {
      baselineLookup.set(key, []);
    }
    baselineLookup.get(key)!.push(entry);
  }

  const newFindings: Finding[] = [];
  const baselineFindings: Finding[] = [];

  for (const finding of scanResult.findings) {
    const hash = generateFindingHash(finding);

    if (baselineHashes.has(hash)) {
      baselineFindings.push(finding);
      continue;
    }

    const key = `${finding.file}:${finding.id}`;
    const candidates = baselineLookup.get(key) || [];

    const fuzzyMatch = candidates.some(candidate => {
      const similarity = calculateSimilarity(
        candidate.code.trim(),
        finding.code.trim().slice(0, 200)
      );
      return similarity > 0.8;
    });

    if (fuzzyMatch) {
      baselineFindings.push(finding);
    } else {
      newFindings.push(finding);
    }
  }

  const newSummary = {
    total: newFindings.length,
    bySeverity: {
      critical: newFindings.filter(f => f.severity === 'critical').length,
      high: newFindings.filter(f => f.severity === 'high').length,
      medium: newFindings.filter(f => f.severity === 'medium').length,
      low: newFindings.filter(f => f.severity === 'low').length,
    },
    byCategory: {} as Record<string, number>,
    autoFixable: newFindings.filter(f => f.autoFixable).length,
  };

  for (const finding of newFindings) {
    newSummary.byCategory[finding.category] =
      (newSummary.byCategory[finding.category] || 0) + 1;
  }

  return {
    ...scanResult,
    findings: newFindings,
    summary: newSummary,
    baselineFiltered: baselineFindings.length,
  } as ScanResult & { baselineFiltered: number };
}

export async function updateBaseline(
  baselinePath: string,
  newFindings: Finding[],
  options: { addedBy?: string; reason?: string } = {}
): Promise<Baseline> {
  let baseline = await loadBaseline(baselinePath);

  if (!baseline) {
    throw new Error('Baseline not found. Create one first with `vibecheck baseline create`');
  }

  const now = new Date().toISOString();
  const existingHashes = new Set(baseline.entries.map(e => e.hash));

  const newEntries: BaselineEntry[] = [];

  for (const finding of newFindings) {
    const hash = generateFindingHash(finding);

    if (!existingHashes.has(hash)) {
      newEntries.push({
        hash,
        ruleId: finding.id,
        file: finding.file,
        line: finding.line,
        code: finding.code.slice(0, 200),
        severity: finding.severity,
        category: finding.category,
        addedAt: now,
        addedBy: options.addedBy,
        reason: options.reason,
      });
    }
  }

  baseline.entries.push(...newEntries);
  baseline.updatedAt = now;
  baseline.metadata.totalFindings = baseline.entries.length;

  baseline.metadata.bySeverity = {
    critical: baseline.entries.filter(e => e.severity === 'critical').length,
    high: baseline.entries.filter(e => e.severity === 'high').length,
    medium: baseline.entries.filter(e => e.severity === 'medium').length,
    low: baseline.entries.filter(e => e.severity === 'low').length,
  };

  await fs.writeFile(baselinePath, JSON.stringify(baseline, null, 2));

  console.log(`✅ Added ${newEntries.length} findings to baseline`);
  console.log(`   Total baseline entries: ${baseline.entries.length}`);

  return baseline;
}

export async function pruneBaseline(
  baselinePath: string,
  currentFindings: Finding[]
): Promise<{ removed: number; remaining: number }> {
  const baseline = await loadBaseline(baselinePath);

  if (!baseline) {
    throw new Error('Baseline not found');
  }

  const currentHashes = new Set(currentFindings.map(f => generateFindingHash(f)));

  const prunedEntries = baseline.entries.filter(entry =>
    currentHashes.has(entry.hash)
  );

  const removedCount = baseline.entries.length - prunedEntries.length;

  baseline.entries = prunedEntries;
  baseline.updatedAt = new Date().toISOString();
  baseline.metadata.totalFindings = prunedEntries.length;

  await fs.writeFile(baselinePath, JSON.stringify(baseline, null, 2));

  return {
    removed: removedCount,
    remaining: prunedEntries.length,
  };
}

function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;

  const maxLen = Math.max(a.length, b.length);
  const distance = levenshteinDistance(a, b);

  return 1 - distance / maxLen;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}
