/**
 * Secret Redaction Utilities
 * 
 * Safely redacts secrets from configuration objects for debugging/logging.
 */

import type { Config } from './loader.js';
import { SECRET_KEYS } from './schema.js';

const REDACTION_PLACEHOLDER = '***REDACTED***';

/**
 * Redact secrets from a configuration object
 */
export function redactSecrets<T extends Record<string, unknown>>(config: T): T {
  const redacted: Record<string, unknown> = { ...config };
  
  for (const key of SECRET_KEYS) {
    if (key in redacted && redacted[key] !== undefined && redacted[key] !== null) {
      const value = String(redacted[key]);
      
      // For URLs, redact credentials but keep structure
      if (value.includes('://')) {
        try {
          const url = new URL(value);
          if (url.username || url.password) {
            url.username = '';
            url.password = '';
            redacted[key] = `${url.protocol}//${REDACTION_PLACEHOLDER}@${url.host}${url.pathname}${url.search}${url.hash}`;
          } else {
            redacted[key] = REDACTION_PLACEHOLDER;
          }
        } catch {
          // Not a valid URL, just redact
          redacted[key] = REDACTION_PLACEHOLDER;
        }
      } else {
        // For non-URLs, show first 4 and last 4 chars if long enough
        if (value.length > 8) {
          redacted[key] = `${value.slice(0, 4)}${REDACTION_PLACEHOLDER}${value.slice(-4)}`;
        } else {
          redacted[key] = REDACTION_PLACEHOLDER;
        }
      }
    }
  }
  
  return redacted as T;
}

/**
 * Check if a key should be redacted
 */
export function isSecretKey(key: string): boolean {
  return SECRET_KEYS.includes(key as typeof SECRET_KEYS[number]);
}
