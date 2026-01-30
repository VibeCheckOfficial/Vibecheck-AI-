/**
 * Badge Generator
 * 
 * Generates SVG badges for README files showing Ship Score status.
 * 
 * @module badges/badge-generator
 */

import type { BadgeStatus, BadgeConfig, BadgeResult } from '@repo/shared-types';

// ============================================================================
// Constants
// ============================================================================

const BADGE_COLORS = {
  SHIP: '#4c1',    // Green
  WARN: '#fe7d37', // Orange
  BLOCK: '#e05d44', // Red
} as const;

const BADGE_LABELS = {
  SHIP: 'passing',
  WARN: 'warning',
  BLOCK: 'failing',
} as const;

const VERIFIED_BADGE_LABELS = {
  SHIP: 'verified',
  WARN: 'warning',
  BLOCK: 'failing',
} as const;

const DEFAULT_LABEL = 'VibeCheck';
const VERIFIED_LABEL = 'VibeCheck ✓';

/**
 * Checkmark SVG path for verified badge
 */
const CHECKMARK_ICON = `<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="white" transform="scale(0.6) translate(2, 3)"/>`;

// ============================================================================
// SVG Templates
// ============================================================================

/**
 * Flat badge template
 */
function flatBadge(label: string, value: string, color: string): string {
  const labelWidth = measureText(label) + 10;
  const valueWidth = measureText(value) + 10;
  const totalWidth = labelWidth + valueWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text aria-hidden="true" x="${labelWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${labelWidth / 2}" y="14">${label}</text>
    <text aria-hidden="true" x="${labelWidth + valueWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${value}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14">${value}</text>
  </g>
</svg>`;
}

/**
 * Flat-square badge template
 */
function flatSquareBadge(label: string, value: string, color: string): string {
  const labelWidth = measureText(label) + 10;
  const valueWidth = measureText(value) + 10;
  const totalWidth = labelWidth + valueWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <g shape-rendering="crispEdges">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text x="${labelWidth / 2}" y="14">${label}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14">${value}</text>
  </g>
</svg>`;
}

/**
 * Plastic badge template
 */
function plasticBadge(label: string, value: string, color: string): string {
  const labelWidth = measureText(label) + 10;
  const valueWidth = measureText(value) + 10;
  const totalWidth = labelWidth + valueWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="18" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#fff" stop-opacity=".7"/>
    <stop offset=".1" stop-color="#aaa" stop-opacity=".1"/>
    <stop offset=".9" stop-color="#000" stop-opacity=".3"/>
    <stop offset="1" stop-color="#000" stop-opacity=".5"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="18" rx="4" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="18" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="18" fill="${color}"/>
    <rect width="${totalWidth}" height="18" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text aria-hidden="true" x="${labelWidth / 2}" y="14" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${labelWidth / 2}" y="13">${label}</text>
    <text aria-hidden="true" x="${labelWidth + valueWidth / 2}" y="14" fill="#010101" fill-opacity=".3">${value}</text>
    <text x="${labelWidth + valueWidth / 2}" y="13">${value}</text>
  </g>
</svg>`;
}

/**
 * For-the-badge template (larger, all caps)
 */
function forTheBadge(label: string, value: string, color: string): string {
  const upperLabel = label.toUpperCase();
  const upperValue = value.toUpperCase();
  const labelWidth = measureTextLarge(upperLabel) + 20;
  const valueWidth = measureTextLarge(upperValue) + 20;
  const totalWidth = labelWidth + valueWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="28" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <g shape-rendering="crispEdges">
    <rect width="${labelWidth}" height="28" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="28" fill="${color}"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="10">
    <text x="${labelWidth / 2}" y="18" font-weight="bold">${upperLabel}</text>
    <text x="${labelWidth + valueWidth / 2}" y="18" font-weight="bold">${upperValue}</text>
  </g>
</svg>`;
}

/**
 * Verified badge template with checkmark icon
 */
function verifiedBadge(label: string, value: string, color: string, score?: number): string {
  const checkmarkWidth = 18;
  const labelWidth = measureText(label) + 10;
  const valueText = score !== undefined ? `${value} ${score}%` : value;
  const valueWidth = measureText(valueText) + 14;
  const totalWidth = checkmarkWidth + labelWidth + valueWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="Verified ${label}: ${value}">
  <title>Verified ${label}: ${value}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${checkmarkWidth}" height="20" fill="#7c3aed"/>
    <rect x="${checkmarkWidth}" width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${checkmarkWidth + labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g>
    <!-- Checkmark icon -->
    <svg x="3" y="3" width="12" height="14" viewBox="0 0 24 24">
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="white"/>
    </svg>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text aria-hidden="true" x="${checkmarkWidth + labelWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${checkmarkWidth + labelWidth / 2}" y="14">${label}</text>
    <text aria-hidden="true" x="${checkmarkWidth + labelWidth + valueWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${valueText}</text>
    <text x="${checkmarkWidth + labelWidth + valueWidth / 2}" y="14">${valueText}</text>
  </g>
</svg>`;
}

/**
 * Verified for-the-badge template (larger with checkmark)
 */
function verifiedForTheBadge(label: string, value: string, color: string, score?: number): string {
  const upperLabel = label.toUpperCase();
  const valueText = score !== undefined ? `${value} ${score}%` : value;
  const upperValue = valueText.toUpperCase();
  const checkmarkWidth = 28;
  const labelWidth = measureTextLarge(upperLabel) + 20;
  const valueWidth = measureTextLarge(upperValue) + 20;
  const totalWidth = checkmarkWidth + labelWidth + valueWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="28" role="img" aria-label="Verified ${label}: ${value}">
  <title>Verified ${label}: ${value}</title>
  <g shape-rendering="crispEdges">
    <rect width="${checkmarkWidth}" height="28" fill="#7c3aed"/>
    <rect x="${checkmarkWidth}" width="${labelWidth}" height="28" fill="#555"/>
    <rect x="${checkmarkWidth + labelWidth}" width="${valueWidth}" height="28" fill="${color}"/>
  </g>
  <g>
    <!-- Checkmark icon -->
    <svg x="5" y="5" width="18" height="18" viewBox="0 0 24 24">
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="white"/>
    </svg>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="10">
    <text x="${checkmarkWidth + labelWidth / 2}" y="18" font-weight="bold">${upperLabel}</text>
    <text x="${checkmarkWidth + labelWidth + valueWidth / 2}" y="18" font-weight="bold">${upperValue}</text>
  </g>
</svg>`;
}

// ============================================================================
// Text Measurement
// ============================================================================

/**
 * Approximate text width for standard font size
 */
function measureText(text: string): number {
  // Approximate character widths for Verdana 11px
  const charWidth = 7;
  return text.length * charWidth;
}

/**
 * Approximate text width for large font size
 */
function measureTextLarge(text: string): number {
  // Approximate character widths for Verdana 10px bold uppercase
  const charWidth = 8;
  return text.length * charWidth;
}

// ============================================================================
// Badge Generator Class
// ============================================================================

/**
 * Badge Generator
 */
export class BadgeGenerator {
  private baseUrl: string;
  private projectId: string;

  constructor(options: { baseUrl?: string; projectId: string }) {
    this.baseUrl = options.baseUrl || 'https://api.vibecheck.dev';
    this.projectId = options.projectId;
  }

  /**
   * Generate a badge from Ship Score
   */
  generate(
    status: BadgeStatus,
    score?: number,
    config: BadgeConfig = { style: 'flat', includeScore: true }
  ): BadgeResult {
    const label = config.label || DEFAULT_LABEL;
    const value = config.includeScore && score !== undefined
      ? `${BADGE_LABELS[status]} ${score}%`
      : BADGE_LABELS[status];
    const color = BADGE_COLORS[status];

    // Generate SVG based on style
    let svg: string;
    switch (config.style) {
      case 'flat-square':
        svg = flatSquareBadge(label, value, color);
        break;
      case 'plastic':
        svg = plasticBadge(label, value, color);
        break;
      case 'for-the-badge':
        svg = forTheBadge(label, value, color);
        break;
      case 'flat':
      default:
        svg = flatBadge(label, value, color);
        break;
    }

    // Generate URLs and embed codes
    const url = `${this.baseUrl}/api/v1/badges/${this.projectId}?style=${config.style}${config.includeScore ? '&score=true' : ''}`;
    
    const markdown = `[![VibeCheck](${url})](${this.baseUrl}/projects/${this.projectId})`;
    
    const html = `<a href="${this.baseUrl}/projects/${this.projectId}"><img src="${url}" alt="VibeCheck"></a>`;

    return {
      svg,
      markdown,
      html,
      url,
    };
  }

  /**
   * Generate badge from ship score breakdown
   */
  generateFromScore(
    score: { total: number; verdict: BadgeStatus },
    config?: BadgeConfig
  ): BadgeResult {
    return this.generate(score.verdict, score.total, config);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a badge generator
 */
export function createBadgeGenerator(options: {
  baseUrl?: string;
  projectId: string;
}): BadgeGenerator {
  return new BadgeGenerator(options);
}

/**
 * Generate badge SVG directly
 */
export function generateBadgeSvg(
  status: BadgeStatus,
  score?: number,
  config: BadgeConfig = { style: 'flat', includeScore: true }
): string {
  const isVerified = config.verified ?? false;
  const label = config.label || DEFAULT_LABEL;
  const labels = isVerified ? VERIFIED_BADGE_LABELS : BADGE_LABELS;
  const value = labels[status];
  const color = BADGE_COLORS[status];
  const displayScore = config.includeScore ? score : undefined;

  // Verified badges use special templates
  if (isVerified) {
    switch (config.style) {
      case 'for-the-badge':
        return verifiedForTheBadge(label, value, color, displayScore);
      default:
        return verifiedBadge(label, value, color, displayScore);
    }
  }

  // Standard badges
  const displayValue = displayScore !== undefined
    ? `${value} ${displayScore}%`
    : value;

  switch (config.style) {
    case 'flat-square':
      return flatSquareBadge(label, displayValue, color);
    case 'plastic':
      return plasticBadge(label, displayValue, color);
    case 'for-the-badge':
      return forTheBadge(label, displayValue, color);
    case 'flat':
    default:
      return flatBadge(label, displayValue, color);
  }
}

/**
 * Generate verified badge SVG (Pro feature)
 */
export function generateVerifiedBadgeSvg(
  status: BadgeStatus,
  score?: number,
  style: 'flat' | 'for-the-badge' = 'flat'
): string {
  return generateBadgeSvg(status, score, {
    style,
    includeScore: true,
    verified: true,
  });
}

/**
 * Map ship verdict to badge status
 */
export function verdictToBadgeStatus(verdict: 'SHIP' | 'WARN' | 'BLOCK'): BadgeStatus {
  return verdict;
}
