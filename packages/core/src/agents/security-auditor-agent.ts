/**
 * Security Auditor Agent
 * 
 * Audits code for security vulnerabilities and compliance issues.
 * Focuses on OWASP Top 10 and common security anti-patterns.
 */

export interface SecurityAuditResult {
  passed: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  vulnerabilities: Vulnerability[];
  recommendations: SecurityRecommendation[];
  compliance: ComplianceCheck[];
  summary: string;
}

export interface Vulnerability {
  id: string;
  type: VulnerabilityType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  file?: string;
  line?: number;
  code?: string;
  cwe?: string;
  remediation: string;
}

export type VulnerabilityType =
  | 'injection'
  | 'xss'
  | 'auth_bypass'
  | 'sensitive_data'
  | 'insecure_config'
  | 'vulnerable_dependency'
  | 'insecure_crypto'
  | 'path_traversal'
  | 'ssrf'
  | 'other';

export interface SecurityRecommendation {
  priority: 'low' | 'medium' | 'high';
  category: string;
  recommendation: string;
  rationale: string;
}

export interface ComplianceCheck {
  name: string;
  passed: boolean;
  details: string;
}

export interface AuditorConfig {
  checkOwasp: boolean;
  checkDependencies: boolean;
  strictMode: boolean;
  customPatterns?: Array<{ pattern: RegExp; message: string; severity: Vulnerability['severity'] }>;
}

const DEFAULT_CONFIG: AuditorConfig = {
  checkOwasp: true,
  checkDependencies: true,
  strictMode: false,
};

// OWASP Top 10 related patterns
const VULNERABILITY_PATTERNS: Array<{
  pattern: RegExp;
  type: VulnerabilityType;
  severity: Vulnerability['severity'];
  message: string;
  cwe?: string;
  remediation: string;
}> = [
  // A03:2021 - Injection
  {
    pattern: /\beval\s*\(/,
    type: 'injection',
    severity: 'critical',
    message: 'eval() can execute arbitrary code',
    cwe: 'CWE-95',
    remediation: 'Remove eval() and use safer alternatives like JSON.parse() for data',
  },
  {
    pattern: /new\s+Function\s*\(/,
    type: 'injection',
    severity: 'high',
    message: 'Function constructor can execute arbitrary code',
    cwe: 'CWE-95',
    remediation: 'Avoid dynamic code generation',
  },
  {
    pattern: /`(?:SELECT|INSERT|UPDATE|DELETE|DROP).*\$\{/i,
    type: 'injection',
    severity: 'critical',
    message: 'SQL injection vulnerability - string interpolation in SQL query',
    cwe: 'CWE-89',
    remediation: 'Use parameterized queries or an ORM',
  },
  {
    pattern: /child_process.*exec\s*\([^)]*\$\{/,
    type: 'injection',
    severity: 'critical',
    message: 'Command injection - variable in shell command',
    cwe: 'CWE-78',
    remediation: 'Use execFile with argument array instead of exec with string',
  },
  
  // A02:2021 - Cryptographic Failures
  {
    pattern: /(?:password|secret|key|token)\s*[:=]\s*['"][^'"]{8,}['"]/i,
    type: 'sensitive_data',
    severity: 'high',
    message: 'Hardcoded credential detected',
    cwe: 'CWE-798',
    remediation: 'Use environment variables for sensitive data',
  },
  {
    pattern: /crypto\.createHash\s*\(\s*['"](?:md5|sha1)['"]/i,
    type: 'insecure_crypto',
    severity: 'medium',
    message: 'Weak hash algorithm (MD5/SHA1)',
    cwe: 'CWE-328',
    remediation: 'Use SHA-256 or stronger hashing algorithms',
  },
  {
    pattern: /Math\.random\s*\(\)/,
    type: 'insecure_crypto',
    severity: 'low',
    message: 'Math.random() is not cryptographically secure',
    cwe: 'CWE-338',
    remediation: 'Use crypto.randomBytes() or crypto.getRandomValues() for security-sensitive randomness',
  },
  
  // A03:2021 - Injection (XSS)
  {
    pattern: /\.innerHTML\s*=/,
    type: 'xss',
    severity: 'high',
    message: 'innerHTML assignment - potential XSS',
    cwe: 'CWE-79',
    remediation: 'Use textContent for text, or sanitize with DOMPurify',
  },
  {
    pattern: /document\.write\s*\(/,
    type: 'xss',
    severity: 'high',
    message: 'document.write() can lead to XSS',
    cwe: 'CWE-79',
    remediation: 'Use DOM manipulation methods instead',
  },
  {
    pattern: /dangerouslySetInnerHTML/,
    type: 'xss',
    severity: 'medium',
    message: 'dangerouslySetInnerHTML in React - ensure content is sanitized',
    cwe: 'CWE-79',
    remediation: 'Sanitize HTML content before using dangerouslySetInnerHTML',
  },
  
  // A01:2021 - Broken Access Control
  {
    pattern: /\.\.\/|\.\.\\|path\.join\s*\([^)]*req\./,
    type: 'path_traversal',
    severity: 'high',
    message: 'Potential path traversal vulnerability',
    cwe: 'CWE-22',
    remediation: 'Validate and sanitize file paths, use path.resolve() and verify within allowed directory',
  },
  
  // A10:2021 - SSRF
  {
    pattern: /fetch\s*\(\s*(?:req\.|request\.)/,
    type: 'ssrf',
    severity: 'medium',
    message: 'Potential SSRF - URL from user input',
    cwe: 'CWE-918',
    remediation: 'Validate and whitelist allowed URLs/domains',
  },
  
  // A05:2021 - Security Misconfiguration
  {
    pattern: /cors\s*\(\s*\{\s*origin\s*:\s*['"]?\*['"]?\s*\}/,
    type: 'insecure_config',
    severity: 'medium',
    message: 'CORS allows all origins',
    cwe: 'CWE-942',
    remediation: 'Restrict CORS to specific trusted origins',
  },
  {
    pattern: /secure\s*:\s*false/,
    type: 'insecure_config',
    severity: 'medium',
    message: 'Insecure cookie configuration',
    cwe: 'CWE-614',
    remediation: 'Set secure: true for cookies in production',
  },
  {
    pattern: /httpOnly\s*:\s*false/,
    type: 'insecure_config',
    severity: 'medium',
    message: 'Cookie without httpOnly flag',
    cwe: 'CWE-1004',
    remediation: 'Set httpOnly: true to prevent XSS access to cookies',
  },
];

export class SecurityAuditorAgent {
  private config: AuditorConfig;

  constructor(config: Partial<AuditorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Perform a security audit on code
   */
  async audit(
    code: string,
    context: {
      filePath: string;
      dependencies?: Record<string, string>;
    }
  ): Promise<SecurityAuditResult> {
    const vulnerabilities: Vulnerability[] = [];
    const recommendations: SecurityRecommendation[] = [];
    const compliance: ComplianceCheck[] = [];

    // Check OWASP patterns
    if (this.config.checkOwasp) {
      const owaspVulns = this.checkOwaspPatterns(code, context.filePath);
      vulnerabilities.push(...owaspVulns);
    }

    // Check custom patterns
    if (this.config.customPatterns) {
      const customVulns = this.checkCustomPatterns(code, context.filePath);
      vulnerabilities.push(...customVulns);
    }

    // Check for security best practices
    const bestPractices = this.checkBestPractices(code);
    recommendations.push(...bestPractices);

    // Compliance checks
    const complianceResults = this.performComplianceChecks(code, vulnerabilities);
    compliance.push(...complianceResults);

    // Calculate risk level
    const riskLevel = this.calculateRiskLevel(vulnerabilities);

    // Determine if audit passed
    const criticalCount = vulnerabilities.filter(v => v.severity === 'critical').length;
    const highCount = vulnerabilities.filter(v => v.severity === 'high').length;
    
    const passed = this.config.strictMode
      ? vulnerabilities.length === 0
      : criticalCount === 0 && highCount === 0;

    // Generate summary
    const summary = this.generateSummary(vulnerabilities, passed, riskLevel);

    return {
      passed,
      riskLevel,
      vulnerabilities,
      recommendations,
      compliance,
      summary,
    };
  }

  /**
   * Check for OWASP vulnerability patterns
   */
  private checkOwaspPatterns(code: string, filePath: string): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = [];
    let vulnId = 1;

    for (const pattern of VULNERABILITY_PATTERNS) {
      const matches = code.matchAll(new RegExp(pattern.pattern, 'g'));
      
      for (const match of matches) {
        vulnerabilities.push({
          id: `VULN-${vulnId++}`,
          type: pattern.type,
          severity: pattern.severity,
          description: pattern.message,
          file: filePath,
          code: match[0].slice(0, 100),
          cwe: pattern.cwe,
          remediation: pattern.remediation,
        });
      }
    }

    return vulnerabilities;
  }

  /**
   * Check custom vulnerability patterns
   */
  private checkCustomPatterns(code: string, filePath: string): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = [];
    let vulnId = 100;

    for (const custom of this.config.customPatterns || []) {
      if (custom.pattern.test(code)) {
        vulnerabilities.push({
          id: `CUSTOM-${vulnId++}`,
          type: 'other',
          severity: custom.severity,
          description: custom.message,
          file: filePath,
          remediation: 'Review and fix the identified issue',
        });
      }
    }

    return vulnerabilities;
  }

  /**
   * Check security best practices
   */
  private checkBestPractices(code: string): SecurityRecommendation[] {
    const recommendations: SecurityRecommendation[] = [];

    // Check for HTTPS enforcement
    if (/http:\/\//.test(code) && !/localhost|127\.0\.0\.1/.test(code)) {
      recommendations.push({
        priority: 'high',
        category: 'Transport Security',
        recommendation: 'Use HTTPS for all external requests',
        rationale: 'HTTP traffic can be intercepted and modified',
      });
    }

    // Check for input validation
    if (/req\.body\.\w+/.test(code) && !/validate|sanitize|zod|joi|yup/.test(code)) {
      recommendations.push({
        priority: 'high',
        category: 'Input Validation',
        recommendation: 'Add input validation for request body',
        rationale: 'Unvalidated input can lead to injection attacks',
      });
    }

    // Check for rate limiting
    if (/router\.(get|post|put|delete)/.test(code) && !/rateLimit|rate-limit/.test(code)) {
      recommendations.push({
        priority: 'medium',
        category: 'Rate Limiting',
        recommendation: 'Consider adding rate limiting to API endpoints',
        rationale: 'Prevents brute force and DoS attacks',
      });
    }

    // Check for logging sensitive data
    if (/console\.log.*(?:password|token|secret|key)/i.test(code)) {
      recommendations.push({
        priority: 'high',
        category: 'Logging',
        recommendation: 'Avoid logging sensitive data',
        rationale: 'Sensitive data in logs can be exposed',
      });
    }

    // Check for error disclosure
    if (/catch.*res\.send\(err\)|catch.*res\.json\(err\)/.test(code)) {
      recommendations.push({
        priority: 'medium',
        category: 'Error Handling',
        recommendation: 'Don\'t expose internal errors to clients',
        rationale: 'Error details can reveal system information',
      });
    }

    return recommendations;
  }

  /**
   * Perform compliance checks
   */
  private performComplianceChecks(
    code: string,
    vulnerabilities: Vulnerability[]
  ): ComplianceCheck[] {
    const checks: ComplianceCheck[] = [];

    // No hardcoded secrets
    const hasSecrets = vulnerabilities.some(v => v.type === 'sensitive_data');
    checks.push({
      name: 'No Hardcoded Secrets',
      passed: !hasSecrets,
      details: hasSecrets ? 'Hardcoded secrets detected' : 'No hardcoded secrets found',
    });

    // No injection vulnerabilities
    const hasInjection = vulnerabilities.some(v => v.type === 'injection');
    checks.push({
      name: 'Injection Prevention',
      passed: !hasInjection,
      details: hasInjection ? 'Potential injection vulnerabilities found' : 'No injection patterns detected',
    });

    // No XSS vulnerabilities
    const hasXss = vulnerabilities.some(v => v.type === 'xss');
    checks.push({
      name: 'XSS Prevention',
      passed: !hasXss,
      details: hasXss ? 'Potential XSS vulnerabilities found' : 'No XSS patterns detected',
    });

    // Secure configuration
    const hasInsecureConfig = vulnerabilities.some(v => v.type === 'insecure_config');
    checks.push({
      name: 'Secure Configuration',
      passed: !hasInsecureConfig,
      details: hasInsecureConfig ? 'Insecure configurations found' : 'Configuration appears secure',
    });

    // No critical vulnerabilities
    const hasCritical = vulnerabilities.some(v => v.severity === 'critical');
    checks.push({
      name: 'No Critical Vulnerabilities',
      passed: !hasCritical,
      details: hasCritical ? 'Critical vulnerabilities must be fixed' : 'No critical vulnerabilities',
    });

    return checks;
  }

  /**
   * Calculate overall risk level
   */
  private calculateRiskLevel(
    vulnerabilities: Vulnerability[]
  ): 'low' | 'medium' | 'high' | 'critical' {
    const criticalCount = vulnerabilities.filter(v => v.severity === 'critical').length;
    const highCount = vulnerabilities.filter(v => v.severity === 'high').length;
    const mediumCount = vulnerabilities.filter(v => v.severity === 'medium').length;

    if (criticalCount > 0) return 'critical';
    if (highCount >= 2) return 'critical';
    if (highCount > 0) return 'high';
    if (mediumCount >= 3) return 'high';
    if (mediumCount > 0) return 'medium';
    return 'low';
  }

  /**
   * Generate audit summary
   */
  private generateSummary(
    vulnerabilities: Vulnerability[],
    passed: boolean,
    riskLevel: string
  ): string {
    const critical = vulnerabilities.filter(v => v.severity === 'critical').length;
    const high = vulnerabilities.filter(v => v.severity === 'high').length;
    const medium = vulnerabilities.filter(v => v.severity === 'medium').length;
    const low = vulnerabilities.filter(v => v.severity === 'low').length;

    let summary = passed 
      ? '✅ Security audit passed' 
      : '❌ Security audit failed';

    summary += ` (Risk: ${riskLevel.toUpperCase()})`;
    summary += `\n\nVulnerabilities: ${critical} critical, ${high} high, ${medium} medium, ${low} low`;

    if (critical > 0) {
      summary += '\n\n⚠️ CRITICAL vulnerabilities require immediate attention!';
    }

    return summary;
  }
}
