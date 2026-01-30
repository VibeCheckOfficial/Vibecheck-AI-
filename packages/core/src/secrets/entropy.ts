/**
 * Shannon Entropy Calculation
 * 
 * Higher entropy indicates more randomness, which is characteristic of real secrets.
 * Used to filter out false positives like placeholder values.
 */

// ============================================================================
// Entropy Calculation
// ============================================================================

/**
 * Calculate Shannon entropy of a string
 * 
 * @param str - The string to analyze
 * @returns Entropy value (0-8 for ASCII, typically 3.5-5.0 for real secrets)
 */
export function calculateEntropy(str: string): number {
  if (!str || str.length === 0) {
    return 0;
  }

  // Count character frequencies
  const freq = new Map<string, number>();
  for (const char of str) {
    freq.set(char, (freq.get(char) ?? 0) + 1);
  }

  // Calculate entropy using Shannon's formula
  let entropy = 0;
  const len = str.length;
  
  for (const count of freq.values()) {
    const probability = count / len;
    entropy -= probability * Math.log2(probability);
  }

  return entropy;
}

/**
 * Check if a string has sufficient entropy to be a real secret
 * 
 * @param str - The string to check
 * @param minEntropy - Minimum entropy threshold (default: 3.5)
 * @returns true if entropy meets threshold
 */
export function hasMinimumEntropy(str: string, minEntropy = 3.5): boolean {
  return calculateEntropy(str) >= minEntropy;
}

// ============================================================================
// Entropy Thresholds by Secret Type
// ============================================================================

/**
 * Recommended entropy thresholds by secret type
 * 
 * Lower thresholds for structured secrets (JWTs, private keys)
 * Higher thresholds for random strings (API keys, tokens)
 */
export const ENTROPY_THRESHOLDS: Record<string, number> = {
  // Cloud providers
  aws_access_key: 3.5,
  aws_secret_key: 4.2,
  google_api_key: 3.5,
  
  // Version control
  github_token: 3.8,
  github_oauth: 3.8,
  github_app: 3.8,
  gitlab_token: 3.5,
  
  // Payment
  stripe_live_key: 3.5,
  stripe_test_key: 3.0,
  stripe_restricted_key: 3.5,
  
  // Communication
  slack_token: 3.5,
  sendgrid_key: 4.0,
  twilio_key: 3.5,
  
  // AI
  openai_key: 4.0,
  anthropic_key: 4.0,
  
  // Auth
  jwt_token: 4.0,
  bearer_token: 3.5,
  
  // Crypto - lower threshold, these have structure
  private_key: 2.0,
  ssh_key: 2.0,
  
  // Database - structure-based, entropy not primary check
  database_url: 2.5,
  
  // Generic - higher threshold to avoid false positives
  api_key: 4.0,
  password: 3.0,
  generic_secret: 4.0,
};

/**
 * Get entropy threshold for a secret type
 * 
 * @param type - The secret type
 * @returns Entropy threshold (defaults to 3.5 if not specified)
 */
export function getEntropyThreshold(type: string): number {
  return ENTROPY_THRESHOLDS[type] ?? 3.5;
}

// ============================================================================
// Entropy Analysis Helpers
// ============================================================================

/**
 * Analyze the entropy characteristics of a string
 * 
 * @param str - The string to analyze
 * @returns Analysis result with entropy and characteristics
 */
export function analyzeEntropy(str: string): EntropyAnalysis {
  const entropy = calculateEntropy(str);
  const length = str.length;
  
  // Character class analysis
  const hasLowercase = /[a-z]/.test(str);
  const hasUppercase = /[A-Z]/.test(str);
  const hasDigits = /[0-9]/.test(str);
  const hasSpecial = /[^a-zA-Z0-9]/.test(str);
  
  const charClasses = [hasLowercase, hasUppercase, hasDigits, hasSpecial].filter(Boolean).length;
  
  // Pattern analysis
  const isRepeating = /^(.)\1+$/.test(str);
  const isSequential = /^(?:01234|12345|23456|34567|45678|56789|abcde|bcdef|ABCDE)/i.test(str);
  const hasRepetition = /(.)\1{3,}/.test(str);
  
  return {
    entropy,
    length,
    charClasses,
    characteristics: {
      hasLowercase,
      hasUppercase,
      hasDigits,
      hasSpecial,
      isRepeating,
      isSequential,
      hasRepetition,
    },
    verdict: getEntropyVerdict(entropy, isRepeating, isSequential),
  };
}

export interface EntropyAnalysis {
  entropy: number;
  length: number;
  charClasses: number;
  characteristics: {
    hasLowercase: boolean;
    hasUppercase: boolean;
    hasDigits: boolean;
    hasSpecial: boolean;
    isRepeating: boolean;
    isSequential: boolean;
    hasRepetition: boolean;
  };
  verdict: 'likely_secret' | 'possible_secret' | 'unlikely_secret' | 'definitely_not_secret';
}

/**
 * Get a verdict based on entropy and patterns
 */
function getEntropyVerdict(
  entropy: number,
  isRepeating: boolean,
  isSequential: boolean
): EntropyAnalysis['verdict'] {
  if (isRepeating || isSequential) {
    return 'definitely_not_secret';
  }
  
  if (entropy >= 4.5) {
    return 'likely_secret';
  }
  
  if (entropy >= 3.5) {
    return 'possible_secret';
  }
  
  if (entropy >= 2.5) {
    return 'unlikely_secret';
  }
  
  return 'definitely_not_secret';
}

// ============================================================================
// Confidence Calculation
// ============================================================================

/**
 * Calculate confidence level based on entropy
 * 
 * @param entropy - The calculated entropy
 * @param minEntropy - Minimum threshold for this pattern
 * @returns Confidence level (0-1)
 */
export function calculateConfidence(entropy: number, minEntropy: number): number {
  if (entropy < minEntropy) {
    return 0;
  }
  
  // Scale from minEntropy to 5.0 (theoretical max for practical secrets)
  const maxEntropy = 5.0;
  const confidence = Math.min(1.0, (entropy - minEntropy) / (maxEntropy - minEntropy) + 0.5);
  
  return Math.round(confidence * 100) / 100;
}

/**
 * Map confidence value to confidence level
 * 
 * @param confidence - Confidence value (0-1)
 * @returns Confidence level
 */
export function toConfidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.5) return 'medium';
  return 'low';
}
