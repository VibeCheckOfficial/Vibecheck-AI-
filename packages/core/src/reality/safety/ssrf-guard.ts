/**
 * SSRF Guard for Reality Mode
 * 
 * Blocks requests to private, link-local, and cloud metadata IP ranges
 * to prevent Server-Side Request Forgery attacks.
 */

import { isIP } from 'net';

// ============================================================================
// Types
// ============================================================================

export interface IpCheckResult {
  blocked: boolean;
  reason?: string;
  range?: string;
}

export interface SsrfGuardConfig {
  /** Block private IP ranges (10.x, 172.16.x, 192.168.x) */
  blockPrivate: boolean;
  /** Block link-local ranges (169.254.x) */
  blockLinkLocal: boolean;
  /** Block cloud metadata endpoints */
  blockMetadata: boolean;
  /** Block IPv6 private/link-local */
  blockIpv6Private: boolean;
  /** Additional IP ranges to block (CIDR notation) */
  additionalBlockedRanges: string[];
  /** Allow loopback/localhost (127.0.0.0/8) - needed for local testing */
  allowLoopback?: boolean;
}

// ============================================================================
// Blocked IP Ranges
// ============================================================================

/**
 * IPv4 private ranges (RFC 1918)
 */
const IPV4_PRIVATE_RANGES = [
  { cidr: '10.0.0.0/8', description: 'Private Class A (RFC 1918)' },
  { cidr: '172.16.0.0/12', description: 'Private Class B (RFC 1918)' },
  { cidr: '192.168.0.0/16', description: 'Private Class C (RFC 1918)' },
] as const;

/**
 * IPv4 link-local range
 */
const IPV4_LINK_LOCAL_RANGES = [
  { cidr: '169.254.0.0/16', description: 'Link-Local (RFC 3927)' },
] as const;

/**
 * Cloud metadata service IPs
 */
const METADATA_SERVICE_RANGES = [
  { cidr: '169.254.169.254/32', description: 'AWS/GCP/Azure Metadata Service' },
  { cidr: '100.100.100.200/32', description: 'Alibaba Cloud Metadata Service' },
  { cidr: '192.0.0.192/32', description: 'Oracle Cloud Metadata Service' },
] as const;

/**
 * IPv6 private and link-local ranges
 */
const IPV6_PRIVATE_RANGES = [
  { cidr: '::1/128', description: 'IPv6 Loopback' },
  { cidr: 'fc00::/7', description: 'IPv6 Unique Local Address' },
  { cidr: 'fe80::/10', description: 'IPv6 Link-Local' },
  { cidr: 'fd00::/8', description: 'IPv6 Private' },
] as const;

/**
 * Other blocked ranges
 */
const OTHER_BLOCKED_RANGES = [
  { cidr: '0.0.0.0/8', description: 'Current Network (RFC 1122)' },
  { cidr: '127.0.0.0/8', description: 'Loopback (blocked except explicit allowlist)' },
  { cidr: '224.0.0.0/4', description: 'Multicast (RFC 3171)' },
  { cidr: '240.0.0.0/4', description: 'Reserved (RFC 1112)' },
  { cidr: '255.255.255.255/32', description: 'Broadcast' },
] as const;

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: SsrfGuardConfig = {
  blockPrivate: true,
  blockLinkLocal: true,
  blockMetadata: true,
  blockIpv6Private: true,
  additionalBlockedRanges: [],
};

// ============================================================================
// SSRF Guard Class
// ============================================================================

export class SsrfGuard {
  private config: SsrfGuardConfig;
  private blockedRanges: Array<{ cidr: string; description: string }>;

  constructor(config: Partial<SsrfGuardConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.blockedRanges = this.buildBlockedRanges();
  }

  /**
   * Check if an IP address should be blocked
   */
  checkIp(ip: string): IpCheckResult {
    // Validate IP format
    const ipVersion = isIP(ip);
    if (ipVersion === 0) {
      return {
        blocked: true,
        reason: 'Invalid IP address format',
      };
    }

    // Check against blocked ranges
    for (const range of this.blockedRanges) {
      if (this.ipInCidr(ip, range.cidr)) {
        return {
          blocked: true,
          reason: range.description,
          range: range.cidr,
        };
      }
    }

    return { blocked: false };
  }

  /**
   * Check if a hostname resolves to a blocked IP
   * Note: This requires async DNS resolution
   */
  async checkHostname(hostname: string): Promise<IpCheckResult> {
    // Skip if it's already an IP
    if (isIP(hostname) !== 0) {
      return this.checkIp(hostname);
    }

    try {
      // Dynamic import to avoid issues in environments without dns
      const dns = await import('dns').then(m => m.promises);
      const addresses = await dns.resolve(hostname);

      for (const addr of addresses) {
        const result = this.checkIp(addr);
        if (result.blocked) {
          return {
            ...result,
            reason: `Hostname ${hostname} resolves to blocked IP: ${result.reason}`,
          };
        }
      }

      return { blocked: false };
    } catch (error) {
      // DNS resolution failed - allow but log
      return {
        blocked: false,
        reason: `DNS resolution failed for ${hostname}`,
      };
    }
  }

  /**
   * Build the list of blocked ranges based on configuration
   */
  private buildBlockedRanges(): Array<{ cidr: string; description: string }> {
    const ranges: Array<{ cidr: string; description: string }> = [];

    if (this.config.blockPrivate) {
      ranges.push(...IPV4_PRIVATE_RANGES);
    }

    if (this.config.blockLinkLocal) {
      ranges.push(...IPV4_LINK_LOCAL_RANGES);
    }

    if (this.config.blockMetadata) {
      ranges.push(...METADATA_SERVICE_RANGES);
    }

    if (this.config.blockIpv6Private) {
      ranges.push(...IPV6_PRIVATE_RANGES);
    }

    // Add other blocked ranges, but filter out loopback if allowed
    const otherRanges = this.config.allowLoopback
      ? OTHER_BLOCKED_RANGES.filter(r => !r.cidr.startsWith('127.'))
      : OTHER_BLOCKED_RANGES;
    ranges.push(...otherRanges);

    // Add custom ranges
    for (const cidr of this.config.additionalBlockedRanges) {
      ranges.push({ cidr, description: 'Custom blocked range' });
    }

    return ranges;
  }

  /**
   * Check if an IP is within a CIDR range
   */
  private ipInCidr(ip: string, cidr: string): boolean {
    const [rangIp, prefixStr] = cidr.split('/');
    const prefix = parseInt(prefixStr, 10);

    // Handle IPv4
    if (isIP(ip) === 4 && isIP(rangIp) === 4) {
      const ipNum = this.ipv4ToNumber(ip);
      const rangeNum = this.ipv4ToNumber(rangIp);
      const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
      return (ipNum & mask) === (rangeNum & mask);
    }

    // Handle IPv6 (simplified - just check prefix match)
    if (isIP(ip) === 6 && isIP(rangIp) === 6) {
      const ipExpanded = this.expandIpv6(ip);
      const rangeExpanded = this.expandIpv6(rangIp);
      const prefixChars = Math.floor(prefix / 4);
      return ipExpanded.slice(0, prefixChars) === rangeExpanded.slice(0, prefixChars);
    }

    return false;
  }

  /**
   * Convert IPv4 address to 32-bit number
   */
  private ipv4ToNumber(ip: string): number {
    const parts = ip.split('.').map(Number);
    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  }

  /**
   * Expand IPv6 address to full form
   */
  private expandIpv6(ip: string): string {
    // Handle :: expansion
    let fullIp = ip;
    if (fullIp.includes('::')) {
      const parts = fullIp.split('::');
      const left = parts[0] ? parts[0].split(':') : [];
      const right = parts[1] ? parts[1].split(':') : [];
      const missing = 8 - left.length - right.length;
      const middle = Array(missing).fill('0000');
      fullIp = [...left, ...middle, ...right].join(':');
    }

    // Pad each segment
    return fullIp
      .split(':')
      .map(seg => seg.padStart(4, '0'))
      .join('');
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Create an SSRF guard with default configuration
 */
export function createSsrfGuard(
  config: Partial<SsrfGuardConfig> = {}
): SsrfGuard {
  return new SsrfGuard(config);
}

/**
 * Quick check if an IP is blocked
 */
export function isBlockedIp(ip: string): boolean {
  return new SsrfGuard().checkIp(ip).blocked;
}

/**
 * Get all blocked ranges for documentation/display
 */
export function getBlockedRanges(): Array<{ cidr: string; description: string }> {
  return [
    ...IPV4_PRIVATE_RANGES,
    ...IPV4_LINK_LOCAL_RANGES,
    ...METADATA_SERVICE_RANGES,
    ...IPV6_PRIVATE_RANGES,
    ...OTHER_BLOCKED_RANGES,
  ];
}
