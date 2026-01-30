/**
 * Anchor Extractor
 * 
 * Extracts "reality anchors" from documentation - concrete references to
 * files, commands, APIs, and other verifiable entities.
 */

import type { DocAnchor } from './types.js';

// ============================================================================
// Anchor Patterns
// ============================================================================

const ANCHOR_PATTERNS: Array<{
  type: DocAnchor['type'];
  patterns: RegExp[];
  extract: (match: RegExpMatchArray) => string;
}> = [
  // File paths
  {
    type: 'file',
    patterns: [
      // Markdown code blocks with file paths
      /`([a-zA-Z0-9_\-./]+\.[a-zA-Z]{1,10})`/g,
      // src/, lib/, packages/ paths
      /\b((?:src|lib|packages|apps|components|hooks|utils|services|api|routes|pages|public|assets)\/[a-zA-Z0-9_\-./]+)/g,
      // Common config files
      /\b((?:package|tsconfig|vite\.config|next\.config|tailwind\.config|\.env|\.gitignore|Dockerfile|docker-compose)\.[a-zA-Z]+)/g,
    ],
    extract: (match) => match[1],
  },

  // CLI Commands
  {
    type: 'command',
    patterns: [
      // Shell code blocks
      /```(?:bash|sh|shell|zsh)\n([\s\S]*?)```/g,
      // npm/yarn/pnpm commands
      /`((?:npm|yarn|pnpm|npx|vibecheck|git|docker|kubectl)\s+[^`]+)`/g,
      // Commands starting with $
      /\$\s*([a-zA-Z][a-zA-Z0-9_\-]*(?:\s+[^\n]+)?)/g,
    ],
    extract: (match) => match[1].trim(),
  },

  // API Endpoints
  {
    type: 'api',
    patterns: [
      // REST endpoints
      /\b((?:GET|POST|PUT|DELETE|PATCH)\s+\/[a-zA-Z0-9_\-/:{}]+)/gi,
      // URL paths in backticks
      /`(\/api\/[a-zA-Z0-9_\-/:{}?&=]+)`/g,
      // HTTP URLs
      /\b(https?:\/\/[^\s<>"\)]+)/g,
    ],
    extract: (match) => match[1],
  },

  // Environment Variables
  {
    type: 'env',
    patterns: [
      // ENV: prefix
      /ENV:\s*([A-Z][A-Z0-9_]+)/g,
      // $ENV_VAR or ${ENV_VAR}
      /\$\{?([A-Z][A-Z0-9_]+)\}?/g,
      // process.env.VAR
      /process\.env\.([A-Z][A-Z0-9_]+)/g,
      // .env references
      /`([A-Z][A-Z0-9_]+)`(?:\s*=|\s+in\s+\.env)/g,
    ],
    extract: (match) => match[1],
  },

  // Config Keys
  {
    type: 'config',
    patterns: [
      // JSON keys in context
      /"([a-zA-Z][a-zA-Z0-9_]+)":\s*(?:true|false|null|"|\d|\[|\{)/g,
      // YAML keys
      /^([a-zA-Z][a-zA-Z0-9_]+):\s*(?!\/\/)/gm,
    ],
    extract: (match) => match[1],
  },

  // Functions
  {
    type: 'function',
    patterns: [
      // function calls in backticks
      /`([a-zA-Z][a-zA-Z0-9_]*)\(\)`/g,
      // function definitions mentioned
      /\b(?:function|const|let|var)\s+([a-zA-Z][a-zA-Z0-9_]*)\s*(?:=\s*(?:async\s*)?\(|=\s*function|\()/g,
    ],
    extract: (match) => match[1],
  },

  // Classes/Types
  {
    type: 'class',
    patterns: [
      // Class names in backticks
      /`([A-Z][a-zA-Z0-9]+)`/g,
      // class/interface/type definitions
      /\b(?:class|interface|type)\s+([A-Z][a-zA-Z0-9]+)/g,
    ],
    extract: (match) => match[1],
  },
];

// ============================================================================
// Anchor Extraction
// ============================================================================

/**
 * Extract all anchors from document content
 */
export function extractAnchors(content: string): DocAnchor[] {
  const anchors: DocAnchor[] = [];
  const seen = new Set<string>();
  const lines = content.split('\n');

  for (const anchorDef of ANCHOR_PATTERNS) {
    for (const pattern of anchorDef.patterns) {
      // Reset lastIndex for global patterns
      pattern.lastIndex = 0;
      
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        const value = anchorDef.extract(match);
        
        // Skip if already seen (dedup)
        const key = `${anchorDef.type}:${value}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // Skip very short or very long values
        if (value.length < 2 || value.length > 200) continue;

        // Skip common false positives
        if (isCommonFalsePositive(value, anchorDef.type)) continue;

        // Find line number
        const beforeMatch = content.slice(0, match.index);
        const line = (beforeMatch.match(/\n/g) || []).length + 1;

        anchors.push({
          type: anchorDef.type,
          value,
          line,
        });
      }
    }
  }

  return anchors;
}

/**
 * Check if a value is a common false positive
 */
function isCommonFalsePositive(value: string, type: DocAnchor['type']): boolean {
  const falsePositives: Record<string, string[]> = {
    file: [
      'example.ts', 'file.js', 'config.json', 'test.ts',
      'index.ts', 'index.js', 'app.tsx', // too generic
    ],
    command: [
      'npm', 'yarn', 'pnpm', 'git', // bare command without args
    ],
    env: [
      'API', 'URL', 'KEY', 'SECRET', 'TOKEN', // too generic
    ],
    config: [
      'true', 'false', 'null', 'name', 'version', 'type', // too common
    ],
    function: [
      'get', 'set', 'run', 'init', 'start', // too generic
    ],
    class: [
      'Error', 'Array', 'Object', 'String', 'Number', 'Boolean', // JS built-ins
      'Promise', 'Map', 'Set', 'Date', 'JSON', 'Math',
    ],
    api: [],
  };

  return falsePositives[type]?.includes(value) ?? false;
}

/**
 * Count anchors by type
 */
export function countAnchorsByType(anchors: DocAnchor[]): Record<string, number> {
  const counts: Record<string, number> = {};
  
  for (const anchor of anchors) {
    counts[anchor.type] = (counts[anchor.type] || 0) + 1;
  }

  return counts;
}

/**
 * Check if content has minimum required anchors
 */
export function hasMinimumAnchors(
  content: string,
  minCount: number,
  requiredTypes?: DocAnchor['type'][]
): { valid: boolean; count: number; missing: string[] } {
  const anchors = extractAnchors(content);
  const typeCounts = countAnchorsByType(anchors);

  const missing: string[] = [];
  
  if (requiredTypes) {
    for (const type of requiredTypes) {
      if (!typeCounts[type]) {
        missing.push(type);
      }
    }
  }

  return {
    valid: anchors.length >= minCount && missing.length === 0,
    count: anchors.length,
    missing,
  };
}

/**
 * Extract file paths specifically (for verifying doc references real files)
 */
export function extractFilePaths(content: string): string[] {
  const anchors = extractAnchors(content);
  return anchors
    .filter(a => a.type === 'file')
    .map(a => a.value);
}

/**
 * Extract commands specifically
 */
export function extractCommands(content: string): string[] {
  const anchors = extractAnchors(content);
  return anchors
    .filter(a => a.type === 'command')
    .map(a => a.value);
}

/**
 * Check if doc references any changed files
 */
export function referencesChangedFiles(
  content: string,
  changedFiles: string[]
): { references: boolean; matchedFiles: string[] } {
  const docFiles = extractFilePaths(content);
  const matched: string[] = [];

  for (const docFile of docFiles) {
    for (const changed of changedFiles) {
      if (changed.includes(docFile) || docFile.includes(changed)) {
        matched.push(changed);
      }
    }
  }

  return {
    references: matched.length > 0,
    matchedFiles: [...new Set(matched)],
  };
}
