/**
 * Unified Entitlement UX Map
 * 
 * Single source of truth for feature gating, benefits messaging,
 * and upgrade prompts across all surfaces (Dashboard, CLI, VS Code Extension).
 * 
 * DO NOT duplicate this data elsewhere. Import and use this module.
 */

import type { Tier } from './index.js';

// ============================================================================
// Feature Keys - Canonical identifiers for Pro-gated features
// ============================================================================

export const FEATURE_KEYS = {
  // Dashboard features
  CLOUD_SYNC: 'cloud_sync',
  TEAM_DASHBOARD: 'team_dashboard',
  UNLIMITED_PROJECTS: 'unlimited_projects',
  API_ACCESS: 'api_access',
  ADVANCED_ANALYTICS: 'advanced_analytics',
  POLICY_ENGINE: 'policy_engine',
  WEBHOOKS: 'webhooks',
  PRIORITY_SUPPORT: 'priority_support',
  
  // CLI features
  SARIF_EXPORT: 'sarif_export', // Free tier has basic SARIF
  ENTERPRISE_REPORTS: 'enterprise_reports',
  CI_GATE: 'ci_gate',
  CUSTOM_RULES: 'custom_rules',
  
  // Forge features (AI Context Generator)
  FORGE_BASIC: 'forge_basic', // Free: 5 rules, minimal tier
  FORGE_EXTENDED: 'forge_extended', // Pro: 20 rules, extended tier
  FORGE_COMPREHENSIVE: 'forge_comprehensive', // Enterprise: 50 rules, comprehensive tier
  
  // Prompt Template Builder features
  PT_BASIC_TEMPLATES: 'pt_basic_templates', // Free: 5 basic templates
  PT_PRO_TEMPLATES: 'pt_pro_templates', // Pro: 25+ templates, all categories
  PT_CUSTOM_TEMPLATES: 'pt_custom_templates', // Enterprise: custom template creation
  
  // Ship & Reality features
  SHIP_REALITY: 'ship_reality', // Pro: Reality Mode verification
  SHIP_CHAOS: 'ship_chaos', // Pro: AI Chaos Agent
  SHIP_BADGE: 'ship_badge', // Pro: Verified Ship Badge for README
  FIX_APPLY: 'fix_apply', // Pro: Auto-apply fixes
  REPORT_PDF: 'report_pdf', // Pro: PDF export
  REPORT_COMPLIANCE: 'report_compliance', // Enterprise: Compliance reports
  
  // Web Dashboard features
  WEB_REALITY_GALLERY: 'web_reality_gallery', // Pro: Screenshots/traces
  WEB_DRIFT_TIMELINE: 'web_drift_timeline', // Pro: Drift timeline
  WEB_REPORTS_EXPORT: 'web_reports_export', // Pro: Export reports
  WEB_TEAM_SEATS: 'web_team_seats', // Pro: Team collaboration
  WEB_INTEGRATIONS: 'web_integrations', // Pro: GitHub/Slack integrations
  
  // VS Code Extension features
  VSCODE_QUICKFIX_APPLY: 'vscode_quickfix_apply', // Pro: Apply fixes
  VSCODE_REALITY_RUN: 'vscode_reality_run', // Pro: Run reality checks
  VSCODE_REPORT_GENERATE: 'vscode_report_generate', // Pro: Generate reports
  
  // MCP Server features
  MCP_FIREWALL_EVALUATE: 'mcp_firewall_evaluate', // Pro: Firewall evaluation
  MCP_REGISTER_ROUTES: 'mcp_register_routes', // Pro: Route registration
  
  // Enterprise features
  SSO: 'sso',
  AUDIT_LOGS: 'audit_logs',
  CUSTOM_POLICIES: 'custom_policies',
  ON_PREM: 'on_prem',
  SLA: 'sla',
  DEDICATED_SUPPORT: 'dedicated_support',
} as const;

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS];

// ============================================================================
// Feature Metadata - Title, description, and benefits for each feature
// ============================================================================

export interface FeatureMetadata {
  key: FeatureKey;
  title: string;
  /** One-line explanation of why this is a Pro feature */
  proReason: string;
  /** Benefits specific to this feature (shown in paywall) */
  benefits: string[];
  /** Minimum tier required */
  requiredTier: Tier;
  /** Optional documentation link */
  docsUrl?: string;
}

export const FEATURE_METADATA: Record<FeatureKey, FeatureMetadata> = {
  // Dashboard Pro features
  [FEATURE_KEYS.CLOUD_SYNC]: {
    key: FEATURE_KEYS.CLOUD_SYNC,
    title: 'Cloud Sync',
    proReason: 'Sync your truthpacks and scan history across devices and team members.',
    benefits: [
      'Access scans from any device',
      'Share truthpacks with your team',
      'Automatic backup and versioning',
      '90-day scan history retention',
    ],
    requiredTier: 'pro',
    docsUrl: '/docs/cloud-sync',
  },
  
  [FEATURE_KEYS.TEAM_DASHBOARD]: {
    key: FEATURE_KEYS.TEAM_DASHBOARD,
    title: 'Team Dashboard',
    proReason: 'Collaborate with your team on code quality and hallucination prevention.',
    benefits: [
      'Invite unlimited team members',
      'Role-based access control',
      'Team-wide scan analytics',
      'Shared project settings',
    ],
    requiredTier: 'pro',
    docsUrl: '/docs/teams',
  },
  
  [FEATURE_KEYS.UNLIMITED_PROJECTS]: {
    key: FEATURE_KEYS.UNLIMITED_PROJECTS,
    title: 'Unlimited Projects',
    proReason: 'Scale VibeCheck across all your repositories without limits.',
    benefits: [
      'Unlimited project tracking',
      'Multi-repo dashboards',
      'Cross-project analytics',
      'Bulk project management',
    ],
    requiredTier: 'pro',
  },
  
  [FEATURE_KEYS.API_ACCESS]: {
    key: FEATURE_KEYS.API_ACCESS,
    title: 'API Access',
    proReason: 'Integrate VibeCheck into your existing tools and workflows.',
    benefits: [
      'RESTful API for all operations',
      'Webhook integrations',
      'CI/CD pipeline support',
      'Custom automation scripts',
    ],
    requiredTier: 'pro',
    docsUrl: '/docs/api',
  },
  
  [FEATURE_KEYS.ADVANCED_ANALYTICS]: {
    key: FEATURE_KEYS.ADVANCED_ANALYTICS,
    title: 'Advanced Analytics',
    proReason: 'Deep insights into your code quality trends over time.',
    benefits: [
      'Trend analysis over 90 days',
      'Finding resolution velocity',
      'Team performance metrics',
      'Export to CSV/JSON',
    ],
    requiredTier: 'pro',
  },
  
  [FEATURE_KEYS.POLICY_ENGINE]: {
    key: FEATURE_KEYS.POLICY_ENGINE,
    title: 'Policy Engine',
    proReason: 'Define and enforce custom code policies across your organization.',
    benefits: [
      'Custom rule definitions',
      'Project-specific policies',
      'Automated policy enforcement',
      'Policy templates library',
    ],
    requiredTier: 'pro',
    docsUrl: '/docs/policies',
  },
  
  [FEATURE_KEYS.WEBHOOKS]: {
    key: FEATURE_KEYS.WEBHOOKS,
    title: 'Webhooks',
    proReason: 'Get real-time notifications when scans complete or issues are found.',
    benefits: [
      'Slack/Discord integration',
      'Custom webhook endpoints',
      'Configurable event triggers',
      'Retry logic for reliability',
    ],
    requiredTier: 'pro',
  },
  
  [FEATURE_KEYS.PRIORITY_SUPPORT]: {
    key: FEATURE_KEYS.PRIORITY_SUPPORT,
    title: 'Priority Support',
    proReason: 'Get faster responses and dedicated help from our team.',
    benefits: [
      '< 4 hour response time',
      'Direct Slack channel access',
      'Screen sharing sessions',
      'Priority bug fixes',
    ],
    requiredTier: 'pro',
  },
  
  // CLI Pro features
  [FEATURE_KEYS.SARIF_EXPORT]: {
    key: FEATURE_KEYS.SARIF_EXPORT,
    title: 'Advanced SARIF Export',
    proReason: 'Enhanced SARIF output with custom metadata for enterprise tooling.',
    benefits: [
      'Custom SARIF extensions',
      'Tool metadata enrichment',
      'Compliance-ready output',
      'Integration with security tools',
    ],
    requiredTier: 'pro',
  },
  
  [FEATURE_KEYS.ENTERPRISE_REPORTS]: {
    key: FEATURE_KEYS.ENTERPRISE_REPORTS,
    title: 'Enterprise Reports',
    proReason: 'Generate executive-ready PDF/HTML reports for stakeholders.',
    benefits: [
      'Executive summary reports',
      'Compliance documentation',
      'Custom branding options',
      'Scheduled report generation',
    ],
    requiredTier: 'pro',
    docsUrl: '/docs/reports',
  },
  
  [FEATURE_KEYS.CI_GATE]: {
    key: FEATURE_KEYS.CI_GATE,
    title: 'CI Gate',
    proReason: 'Block deployments when critical issues are found.',
    benefits: [
      'GitHub Actions integration',
      'GitLab CI support',
      'Configurable thresholds',
      'PR status checks',
    ],
    requiredTier: 'pro',
    docsUrl: '/docs/ci-integration',
  },
  
  [FEATURE_KEYS.CUSTOM_RULES]: {
    key: FEATURE_KEYS.CUSTOM_RULES,
    title: 'Custom Rules',
    proReason: 'Define your own validation rules tailored to your codebase.',
    benefits: [
      'Regex-based pattern matching',
      'AST-level rules',
      'Rule severity configuration',
      'Shared rule libraries',
    ],
    requiredTier: 'pro',
  },
  
  // Forge features (AI Context Generator)
  [FEATURE_KEYS.FORGE_BASIC]: {
    key: FEATURE_KEYS.FORGE_BASIC,
    title: 'Forge Basic',
    proReason: 'Generate essential AI context rules for your codebase.',
    benefits: [
      '5 high-impact rules (minimal tier)',
      'Architecture and avoid patterns',
      'TypeScript and component rules',
      'Incremental updates',
    ],
    requiredTier: 'free',
    docsUrl: '/docs/forge',
  },
  
  [FEATURE_KEYS.FORGE_EXTENDED]: {
    key: FEATURE_KEYS.FORGE_EXTENDED,
    title: 'Forge Extended',
    proReason: 'Comprehensive AI context with advanced rule generation.',
    benefits: [
      '20 rules (extended tier)',
      'All basic rules plus security, performance, accessibility',
      'AI Contract generation',
      'Multi-platform support (Cursor, Windsurf, Copilot)',
    ],
    requiredTier: 'pro',
    docsUrl: '/docs/forge',
  },
  
  [FEATURE_KEYS.FORGE_COMPREHENSIVE]: {
    key: FEATURE_KEYS.FORGE_COMPREHENSIVE,
    title: 'Forge Comprehensive',
    proReason: 'Full AI context suite for enterprise teams.',
    benefits: [
      '50 rules (comprehensive tier)',
      'All categories including i18n, caching, logging',
      'Subagent and skill definitions',
      'Custom hook generation',
    ],
    requiredTier: 'enterprise',
    docsUrl: '/docs/forge',
  },
  
  // Prompt Template Builder features
  [FEATURE_KEYS.PT_BASIC_TEMPLATES]: {
    key: FEATURE_KEYS.PT_BASIC_TEMPLATES,
    title: 'Basic Prompt Templates',
    proReason: 'Essential prompt templates for common development tasks.',
    benefits: [
      '5 core templates',
      'Feature implementation template',
      'Bug fix template',
      'Refactoring template',
    ],
    requiredTier: 'free',
    docsUrl: '/docs/prompt-builder',
  },
  
  [FEATURE_KEYS.PT_PRO_TEMPLATES]: {
    key: FEATURE_KEYS.PT_PRO_TEMPLATES,
    title: 'Pro Prompt Templates',
    proReason: 'Extensive library of production-ready prompt templates.',
    benefits: [
      '25+ templates across 15 categories',
      'Auth, API, database, testing templates',
      'Deployment and CI/CD templates',
      'Smart variable interpolation',
    ],
    requiredTier: 'pro',
    docsUrl: '/docs/prompt-builder',
  },
  
  [FEATURE_KEYS.PT_CUSTOM_TEMPLATES]: {
    key: FEATURE_KEYS.PT_CUSTOM_TEMPLATES,
    title: 'Custom Prompt Templates',
    proReason: 'Create and share custom templates across your organization.',
    benefits: [
      'Custom template creation',
      'Organization-wide template sharing',
      'Template versioning',
      'Template analytics',
    ],
    requiredTier: 'enterprise',
    docsUrl: '/docs/prompt-builder',
  },
  
  // Ship & Reality features
  [FEATURE_KEYS.SHIP_REALITY]: {
    key: FEATURE_KEYS.SHIP_REALITY,
    title: 'Reality Mode',
    proReason: 'Runtime verification catches issues that static analysis misses.',
    benefits: [
      'Browser-based route testing',
      'Screenshot evidence',
      'Runtime error detection',
      'Network request validation',
    ],
    requiredTier: 'pro',
    docsUrl: '/docs/reality-mode',
  },
  
  [FEATURE_KEYS.SHIP_CHAOS]: {
    key: FEATURE_KEYS.SHIP_CHAOS,
    title: 'AI Chaos Agent',
    proReason: 'Autonomous bug hunting finds issues you would miss.',
    benefits: [
      'AI-powered exploration',
      'Edge case discovery',
      'Security testing',
      'Reproducible test generation',
    ],
    requiredTier: 'pro',
    docsUrl: '/docs/chaos-agent',
  },
  
  [FEATURE_KEYS.SHIP_BADGE]: {
    key: FEATURE_KEYS.SHIP_BADGE,
    title: 'Verified Ship Badge',
    proReason: 'Show your code quality commitment with a verified badge in your README.',
    benefits: [
      'Dynamic SVG badge for README',
      'Real-time Ship Score display',
      'Verified checkmark for passing ships',
      'Build trust with users & contributors',
    ],
    requiredTier: 'pro',
    docsUrl: '/docs/ship-badge',
  },
  
  [FEATURE_KEYS.FIX_APPLY]: {
    key: FEATURE_KEYS.FIX_APPLY,
    title: 'Auto-Apply Fixes',
    proReason: 'One-click fixes for detected issues.',
    benefits: [
      'Automatic code fixes',
      'Rollback support',
      'Fix verification',
      'Mission-based grouping',
    ],
    requiredTier: 'pro',
  },
  
  [FEATURE_KEYS.REPORT_PDF]: {
    key: FEATURE_KEYS.REPORT_PDF,
    title: 'PDF Reports',
    proReason: 'Shareable PDF reports for stakeholders.',
    benefits: [
      'Executive summaries',
      'Custom branding',
      'Compliance documentation',
      'Ship Score history',
    ],
    requiredTier: 'pro',
  },
  
  [FEATURE_KEYS.REPORT_COMPLIANCE]: {
    key: FEATURE_KEYS.REPORT_COMPLIANCE,
    title: 'Compliance Reports',
    proReason: 'Meet regulatory requirements with compliance-ready reports.',
    benefits: [
      'SOC 2 documentation',
      'GDPR compliance',
      'Security audit trails',
      'Custom compliance templates',
    ],
    requiredTier: 'enterprise',
  },
  
  // Web Dashboard features
  [FEATURE_KEYS.WEB_REALITY_GALLERY]: {
    key: FEATURE_KEYS.WEB_REALITY_GALLERY,
    title: 'Reality Gallery',
    proReason: 'Visual evidence from reality mode runs.',
    benefits: [
      'Screenshot gallery',
      'Trace viewer',
      'HAR file analysis',
      'Video recordings',
    ],
    requiredTier: 'pro',
  },
  
  [FEATURE_KEYS.WEB_DRIFT_TIMELINE]: {
    key: FEATURE_KEYS.WEB_DRIFT_TIMELINE,
    title: 'Drift Timeline',
    proReason: 'Track how your codebase changes over time.',
    benefits: [
      'Change detection',
      'Diff viewer',
      'Regression alerts',
      'Historical comparison',
    ],
    requiredTier: 'pro',
  },
  
  [FEATURE_KEYS.WEB_REPORTS_EXPORT]: {
    key: FEATURE_KEYS.WEB_REPORTS_EXPORT,
    title: 'Report Export',
    proReason: 'Export and share reports.',
    benefits: [
      'PDF export',
      'JSON export',
      'Scheduled reports',
      'Email delivery',
    ],
    requiredTier: 'pro',
  },
  
  [FEATURE_KEYS.WEB_TEAM_SEATS]: {
    key: FEATURE_KEYS.WEB_TEAM_SEATS,
    title: 'Team Seats',
    proReason: 'Collaborate with your team.',
    benefits: [
      'Unlimited team members',
      'Role-based access',
      'Shared projects',
      'Team analytics',
    ],
    requiredTier: 'pro',
  },
  
  [FEATURE_KEYS.WEB_INTEGRATIONS]: {
    key: FEATURE_KEYS.WEB_INTEGRATIONS,
    title: 'Integrations',
    proReason: 'Connect with your existing tools.',
    benefits: [
      'GitHub Checks',
      'Slack notifications',
      'CI/CD gates',
      'Webhook support',
    ],
    requiredTier: 'pro',
  },
  
  // VS Code Extension features
  [FEATURE_KEYS.VSCODE_QUICKFIX_APPLY]: {
    key: FEATURE_KEYS.VSCODE_QUICKFIX_APPLY,
    title: 'Quick Fix Apply',
    proReason: 'Apply fixes directly from your editor.',
    benefits: [
      'One-click fixes',
      'Inline diff preview',
      'Undo support',
      'Batch application',
    ],
    requiredTier: 'pro',
  },
  
  [FEATURE_KEYS.VSCODE_REALITY_RUN]: {
    key: FEATURE_KEYS.VSCODE_REALITY_RUN,
    title: 'Run Reality Checks',
    proReason: 'Run reality mode from VS Code.',
    benefits: [
      'Inline test triggers',
      'Result visualization',
      'Screenshot preview',
      'Error navigation',
    ],
    requiredTier: 'pro',
  },
  
  [FEATURE_KEYS.VSCODE_REPORT_GENERATE]: {
    key: FEATURE_KEYS.VSCODE_REPORT_GENERATE,
    title: 'Generate Reports',
    proReason: 'Generate reports from your editor.',
    benefits: [
      'Instant report generation',
      'Multiple formats',
      'Custom templates',
      'Share directly',
    ],
    requiredTier: 'pro',
  },
  
  // MCP Server features
  [FEATURE_KEYS.MCP_FIREWALL_EVALUATE]: {
    key: FEATURE_KEYS.MCP_FIREWALL_EVALUATE,
    title: 'Agent Firewall',
    proReason: 'Block AI agents from making unauthorized changes.',
    benefits: [
      'Real-time validation',
      'Intent verification',
      'Code review gates',
      'Audit logging',
    ],
    requiredTier: 'pro',
  },
  
  [FEATURE_KEYS.MCP_REGISTER_ROUTES]: {
    key: FEATURE_KEYS.MCP_REGISTER_ROUTES,
    title: 'Route Registration',
    proReason: 'Programmatically register routes and env vars.',
    benefits: [
      'API route registration',
      'Env var registration',
      'Type registration',
      'CI/CD integration',
    ],
    requiredTier: 'pro',
  },
  
  // Enterprise features
  [FEATURE_KEYS.SSO]: {
    key: FEATURE_KEYS.SSO,
    title: 'SSO/SAML',
    proReason: 'Enterprise-grade authentication with your identity provider.',
    benefits: [
      'SAML 2.0 support',
      'Okta, Azure AD, OneLogin',
      'Automatic provisioning',
      'Centralized access control',
    ],
    requiredTier: 'enterprise',
  },
  
  [FEATURE_KEYS.AUDIT_LOGS]: {
    key: FEATURE_KEYS.AUDIT_LOGS,
    title: 'Audit Logs',
    proReason: 'Complete audit trail for compliance and security.',
    benefits: [
      'Full activity history',
      '365-day retention',
      'Export for compliance',
      'Real-time log streaming',
    ],
    requiredTier: 'enterprise',
  },
  
  [FEATURE_KEYS.CUSTOM_POLICIES]: {
    key: FEATURE_KEYS.CUSTOM_POLICIES,
    title: 'Custom Policies',
    proReason: 'Organization-wide policy enforcement at scale.',
    benefits: [
      'Org-level policy templates',
      'Mandatory policy inheritance',
      'Policy compliance dashboards',
      'Violation alerting',
    ],
    requiredTier: 'enterprise',
  },
  
  [FEATURE_KEYS.ON_PREM]: {
    key: FEATURE_KEYS.ON_PREM,
    title: 'On-Premises Deployment',
    proReason: 'Run VibeCheck entirely within your infrastructure.',
    benefits: [
      'Air-gapped deployment',
      'Data sovereignty compliance',
      'Custom infrastructure',
      'Dedicated resources',
    ],
    requiredTier: 'enterprise',
  },
  
  [FEATURE_KEYS.SLA]: {
    key: FEATURE_KEYS.SLA,
    title: 'SLA Guarantee',
    proReason: '99.9% uptime guarantee with financial backing.',
    benefits: [
      '99.9% uptime SLA',
      'Financial credits for downtime',
      'Priority incident response',
      'Dedicated status page',
    ],
    requiredTier: 'enterprise',
  },
  
  [FEATURE_KEYS.DEDICATED_SUPPORT]: {
    key: FEATURE_KEYS.DEDICATED_SUPPORT,
    title: 'Dedicated Support',
    proReason: 'A dedicated success team for your organization.',
    benefits: [
      'Named account manager',
      'Quarterly business reviews',
      'Custom training sessions',
      'Architecture consulting',
    ],
    requiredTier: 'enterprise',
  },
};

// ============================================================================
// Plan Definitions - Consistent across all surfaces
// ============================================================================

export interface PlanDefinition {
  id: Tier;
  name: string;
  tagline: string;
  price: number | null;
  priceLabel: string;
  interval: 'month' | 'year' | null;
  features: string[];
  limits: {
    projects: number;
    scansPerMonth: number;
    seats: number;
    retentionDays: number;
  };
  bestFor: string;
  popular?: boolean;
  cta: string;
  ctaVariant: 'default' | 'outline' | 'secondary';
}

export const PLAN_DEFINITIONS: Record<Tier, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Free',
    tagline: 'Perfect for individual developers',
    price: 0,
    priceLabel: '$0',
    interval: 'month',
    features: [
      'Full CLI access (all commands)',
      '10 scans per month',
      'Basic SARIF output',
      '3 local projects',
      '7-day scan history',
      'Community support',
    ],
    limits: {
      projects: 3,
      scansPerMonth: 10, // 10 per month for free tier
      seats: 1,
      retentionDays: 7,
    },
    bestFor: 'Solo developers and small side projects',
    cta: 'Current Plan',
    ctaVariant: 'secondary',
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    tagline: 'For teams shipping production code',
    price: 29,
    priceLabel: '$29',
    interval: 'month',
    features: [
      'Everything in Free',
      'Cloud sync & dashboard',
      'Unlimited projects',
      'Team collaboration',
      'API access & webhooks',
      'Policy engine',
      '90-day scan history',
      'Priority support',
    ],
    limits: {
      projects: -1, // Unlimited
      scansPerMonth: -1,
      seats: -1,
      retentionDays: 90,
    },
    bestFor: 'Growing teams and production applications',
    popular: true,
    cta: 'Upgrade to Pro',
    ctaVariant: 'default',
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'For organizations with advanced needs',
    price: null,
    priceLabel: 'Custom',
    interval: null,
    features: [
      'Everything in Pro',
      'SSO/SAML authentication',
      'Audit logs (365-day retention)',
      'Custom policies',
      'On-premises deployment',
      'Dedicated support team',
      'SLA guarantee',
      'Custom training',
    ],
    limits: {
      projects: -1,
      scansPerMonth: -1,
      seats: -1,
      retentionDays: 365,
    },
    bestFor: 'Large organizations with compliance requirements',
    cta: 'Contact Sales',
    ctaVariant: 'outline',
  },
};

// ============================================================================
// Tier Checking Utilities
// ============================================================================

const TIER_ORDER: Tier[] = ['free', 'pro', 'enterprise'];

/**
 * Check if a tier meets the minimum requirement
 */
export function tierMeetsRequirement(userTier: Tier, requiredTier: Tier): boolean {
  const userIndex = TIER_ORDER.indexOf(userTier);
  const requiredIndex = TIER_ORDER.indexOf(requiredTier);
  return userIndex >= requiredIndex;
}

/**
 * Check if a user has access to a feature
 */
export function hasFeatureAccess(userTier: Tier, featureKey: FeatureKey): boolean {
  const metadata = FEATURE_METADATA[featureKey];
  if (!metadata) return false;
  return tierMeetsRequirement(userTier, metadata.requiredTier);
}

/**
 * Get the upgrade tier for a user (null if already at max)
 */
export function getUpgradeTier(currentTier: Tier): Tier | null {
  const currentIndex = TIER_ORDER.indexOf(currentTier);
  if (currentIndex >= TIER_ORDER.length - 1) return null;
  return TIER_ORDER[currentIndex + 1] ?? null;
}

/**
 * Get feature metadata by key
 */
export function getFeatureMetadata(featureKey: FeatureKey): FeatureMetadata | undefined {
  return FEATURE_METADATA[featureKey];
}

/**
 * Get all features available at a tier
 */
export function getFeaturesForTier(tier: Tier): FeatureKey[] {
  return Object.values(FEATURE_KEYS).filter((key) => {
    const metadata = FEATURE_METADATA[key];
    return metadata && tierMeetsRequirement(tier, metadata.requiredTier);
  });
}

/**
 * Get all features gated behind a tier (requires upgrade)
 */
export function getGatedFeatures(currentTier: Tier): FeatureKey[] {
  return Object.values(FEATURE_KEYS).filter((key) => {
    const metadata = FEATURE_METADATA[key];
    return metadata && !tierMeetsRequirement(currentTier, metadata.requiredTier);
  });
}

// ============================================================================
// Upgrade URLs
// ============================================================================

export const UPGRADE_URLS = {
  /** Dashboard billing page */
  DASHBOARD_BILLING: '/billing',
  /** Dashboard checkout (with plan param) */
  DASHBOARD_CHECKOUT: '/billing?action=checkout&plan=pro',
  /** Enterprise contact form */
  ENTERPRISE_CONTACT: '/contact-sales',
  /** Full URL for CLI/extension */
  FULL_DASHBOARD_CHECKOUT: 'https://app.vibecheck.dev/billing?action=checkout&plan=pro',
  FULL_ENTERPRISE_CONTACT: 'https://app.vibecheck.dev/contact-sales',
  /** Start trial URL */
  START_TRIAL: '/billing?action=trial',
  FULL_START_TRIAL: 'https://app.vibecheck.dev/billing?action=trial',
} as const;

// ============================================================================
// Trial Configuration
// ============================================================================

export const TRIAL_CONFIG = {
  /** Trial duration in days */
  DURATION_DAYS: 3,
  /** Features available during trial (same as Pro) */
  TRIAL_TIER: 'pro' as Tier,
  /** Grace period after trial ends (hours) */
  GRACE_PERIOD_HOURS: 24,
} as const;

/**
 * Check if a user is in an active trial
 */
export function isTrialActive(trialEndDate: Date | string | null): boolean {
  if (!trialEndDate) return false;
  const endDate = typeof trialEndDate === 'string' ? new Date(trialEndDate) : trialEndDate;
  return endDate > new Date();
}

/**
 * Get days remaining in trial
 */
export function getTrialDaysRemaining(trialEndDate: Date | string | null): number {
  if (!trialEndDate) return 0;
  const endDate = typeof trialEndDate === 'string' ? new Date(trialEndDate) : trialEndDate;
  const now = new Date();
  const diffMs = endDate.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Calculate trial end date from start
 */
export function calculateTrialEndDate(startDate: Date = new Date()): Date {
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + TRIAL_CONFIG.DURATION_DAYS);
  return endDate;
}

// ============================================================================
// Paywall Context Types
// ============================================================================

export type PaywallSurface = 'dashboard' | 'cli' | 'vscode';

export interface PaywallContext {
  featureKey: FeatureKey;
  surface: PaywallSurface;
  attemptedAction: string;
  /** The command/action to suggest re-running after upgrade */
  retryAction?: string;
}

/**
 * Build paywall display data for a given context
 */
export function buildPaywallData(context: PaywallContext) {
  const metadata = FEATURE_METADATA[context.featureKey];
  if (!metadata) {
    throw new Error(`Unknown feature key: ${context.featureKey}`);
  }
  
  const upgradeTier = metadata.requiredTier;
  const plan = PLAN_DEFINITIONS[upgradeTier];
  
  return {
    title: metadata.title,
    reason: metadata.proReason,
    benefits: metadata.benefits,
    attemptedAction: context.attemptedAction,
    retryAction: context.retryAction,
    requiredTier: upgradeTier,
    plan,
    upgradeUrl: upgradeTier === 'enterprise' 
      ? UPGRADE_URLS.ENTERPRISE_CONTACT 
      : UPGRADE_URLS.DASHBOARD_CHECKOUT,
    fullUpgradeUrl: upgradeTier === 'enterprise'
      ? UPGRADE_URLS.FULL_ENTERPRISE_CONTACT
      : UPGRADE_URLS.FULL_DASHBOARD_CHECKOUT,
    docsUrl: metadata.docsUrl,
  };
}

// ============================================================================
// Analytics Event Names (for consistency)
// ============================================================================

export const ANALYTICS_EVENTS = {
  // Auth funnel
  AUTH_SIGNUP_STARTED: 'auth_signup_started',
  AUTH_SIGNUP_COMPLETED: 'auth_signup_completed',
  AUTH_LOGIN_STARTED: 'auth_login_started',
  AUTH_LOGIN_COMPLETED: 'auth_login_completed',
  
  // Onboarding funnel
  ONBOARDING_STARTED: 'onboarding_started',
  ONBOARDING_STEP_COMPLETED: 'onboarding_step_completed',
  ONBOARDING_COMPLETED: 'onboarding_completed',
  ONBOARDING_SKIPPED: 'onboarding_skipped',
  
  // First value
  FIRST_SCAN_COMPLETED: 'first_scan_completed',
  FIRST_REPORT_VIEWED: 'first_report_viewed',
  
  // Paywall funnel
  PAYWALL_SHOWN: 'paywall_shown',
  PAYWALL_DISMISSED: 'paywall_dismissed',
  PAYWALL_CTA_CLICKED: 'paywall_cta_clicked',
  PAYWALL_COMPARISON_VIEWED: 'paywall_comparison_viewed',
  
  // Upgrade funnel
  UPGRADE_STARTED: 'upgrade_started',
  UPGRADE_COMPLETED: 'upgrade_completed',
  UPGRADE_FAILED: 'upgrade_failed',
  UPGRADE_CANCELLED: 'upgrade_cancelled',
  
  // Entitlements
  ENTITLEMENT_REFRESHED: 'entitlement_refreshed',
  ENTITLEMENT_CHECK_FAILED: 'entitlement_check_failed',
} as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
