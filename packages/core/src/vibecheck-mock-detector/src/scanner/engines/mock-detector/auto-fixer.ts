// src/scanner/engines/mock-detector/auto-fixer.ts

import type { Finding } from './types';

export interface AutoFix {
  finding: Finding;
  originalCode: string;
  fixedCode: string;
  description: string;
  safe: boolean;
}

export function generateAutoFix(finding: Finding, fileContent: string): AutoFix | null {
  const lines = fileContent.split('\n');
  const lineIndex = finding.line - 1;
  const originalLine = lines[lineIndex];

  if (!originalLine) return null;

  const fixers: Record<string, (f: Finding, line: string) => AutoFix | null> = {
    'console-log': fixConsoleLog,
    'debugger-statement': fixDebugger,
    'if-true-false': fixHardcodedConditional,
    'mock-initial-state': fixMockInitialState,
    'mock-initial-array': fixMockInitialArray,
    'hardcoded-localhost': fixHardcodedUrl,
    'lorem-ipsum': fixLoremIpsum,
    'empty-content': fixEmptyContent,
  };

  const fixer = fixers[finding.id];
  if (!fixer) return null;

  return fixer(finding, originalLine);
}

function fixConsoleLog(finding: Finding, line: string): AutoFix {
  const fixedCode = `// ${line.trim()} // REMOVED: console statement`;

  return {
    finding,
    originalCode: line,
    fixedCode,
    description: 'Comment out console statement',
    safe: true,
  };
}

function fixDebugger(finding: Finding, line: string): AutoFix {
  return {
    finding,
    originalCode: line,
    fixedCode: '',
    description: 'Remove debugger statement',
    safe: true,
  };
}

function fixHardcodedConditional(finding: Finding, line: string): AutoFix {
  let fixedCode = line;

  if (/if\s*\(\s*true\s*\)/.test(line)) {
    fixedCode = line.replace(
      /if\s*\(\s*true\s*\)/,
      "if (process.env.NODE_ENV === 'development') /* TODO: replace with real condition */"
    );
  } else if (/if\s*\(\s*false\s*\)/.test(line)) {
    fixedCode = line.replace(
      /if\s*\(\s*false\s*\)/,
      "if (false) /* TODO: dead code - remove or replace with real condition */"
    );
  }

  return {
    finding,
    originalCode: line,
    fixedCode,
    description: 'Add environment check and TODO comment',
    safe: false,
  };
}

function fixMockInitialState(finding: Finding, line: string): AutoFix {
  const fixedCode = line.replace(
    /useState\s*\(\s*\{[^}]+\}\s*\)/,
    'useState(null) /* TODO: fetch real data in useEffect */'
  );

  return {
    finding,
    originalCode: line,
    fixedCode,
    description: 'Replace mock initial state with null',
    safe: false,
  };
}

function fixMockInitialArray(finding: Finding, line: string): AutoFix {
  const fixedCode = line.replace(
    /useState\s*\(\s*\[[^\]]+\]\s*\)/,
    'useState([]) /* TODO: fetch real data in useEffect */'
  );

  return {
    finding,
    originalCode: line,
    fixedCode,
    description: 'Replace mock initial array with empty array',
    safe: false,
  };
}

function fixHardcodedUrl(finding: Finding, line: string): AutoFix {
  const urlMatch = line.match(/(https?:\/\/localhost:\d+)/);
  if (!urlMatch) {
    return {
      finding,
      originalCode: line,
      fixedCode: line,
      description: 'Could not extract URL',
      safe: false,
    };
  }

  const fixedCode = line.replace(
    urlMatch[1],
    "process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'"
  );

  return {
    finding,
    originalCode: line,
    fixedCode,
    description: 'Replace hardcoded URL with environment variable',
    safe: false,
  };
}

function fixLoremIpsum(finding: Finding, line: string): AutoFix {
  const fixedCode = line.replace(
    /lorem\s+ipsum[^'"`]*/gi,
    '/* TODO: Add real content */'
  );

  return {
    finding,
    originalCode: line,
    fixedCode,
    description: 'Replace lorem ipsum with TODO comment',
    safe: true,
  };
}

function fixEmptyContent(finding: Finding, line: string): AutoFix {
  const fixedCode = line.replace(
    /:\s*(['"`])\1/,
    ": '' /* TODO: Add content */"
  );

  return {
    finding,
    originalCode: line,
    fixedCode,
    description: 'Add TODO for empty content',
    safe: true,
  };
}

export async function applyFixes(
  filePath: string,
  fixes: AutoFix[],
  dryRun = true
): Promise<string> {
  const fs = await import('fs/promises');
  let content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n');

  const sortedFixes = [...fixes].sort((a, b) => b.finding.line - a.finding.line);

  for (const fix of sortedFixes) {
    if (!fix.safe && !dryRun) continue;

    const lineIndex = fix.finding.line - 1;
    if (fix.fixedCode === '') {
      lines.splice(lineIndex, 1);
    } else {
      lines[lineIndex] = fix.fixedCode;
    }
  }

  const result = lines.join('\n');

  if (!dryRun) {
    await fs.writeFile(filePath, result, 'utf-8');
  }

  return result;
}
