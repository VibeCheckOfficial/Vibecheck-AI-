/**
 * Health Checks
 * 
 * Built-in health checks for doctor command.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

import type {
  HealthCheck,
  CheckResult,
  DoctorReport,
  DoctorCheckResult,
  DoctorSummary,
} from './types.js';

// ============================================================================
// Built-in Checks
// ============================================================================

/**
 * Check Node.js version
 */
export const checkNodeVersion: HealthCheck = {
  id: 'node-version',
  name: 'Node.js Version',
  description: 'Verify Node.js version is compatible',
  category: 'environment',
  required: true,
  check: async (): Promise<CheckResult> => {
    const version = process.version;
    const major = parseInt(version.slice(1).split('.')[0], 10);

    if (major >= 18) {
      return {
        status: 'pass',
        message: `Node.js ${version} is supported`,
      };
    }

    if (major >= 16) {
      return {
        status: 'warn',
        message: `Node.js ${version} is supported but upgrading is recommended`,
        details: 'Recommended: Node.js 18 or higher',
      };
    }

    return {
      status: 'fail',
      message: `Node.js ${version} is not supported`,
      details: 'Required: Node.js 16 or higher',
      fixAvailable: false,
    };
  },
};

/**
 * Check npm/pnpm availability
 */
export const checkPackageManager: HealthCheck = {
  id: 'package-manager',
  name: 'Package Manager',
  description: 'Verify npm or pnpm is available',
  category: 'environment',
  required: true,
  check: async (): Promise<CheckResult> => {
    try {
      const pnpmVersion = execSync('pnpm --version', { 
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      return {
        status: 'pass',
        message: `pnpm ${pnpmVersion} is available`,
      };
    } catch {
      try {
        const npmVersion = execSync('npm --version', { 
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
        return {
          status: 'pass',
          message: `npm ${npmVersion} is available`,
        };
      } catch {
        return {
          status: 'fail',
          message: 'No package manager found',
          details: 'Install npm or pnpm',
        };
      }
    }
  },
};

/**
 * Check git availability
 */
export const checkGit: HealthCheck = {
  id: 'git',
  name: 'Git',
  description: 'Verify git is installed',
  category: 'environment',
  required: false,
  check: async (): Promise<CheckResult> => {
    try {
      const version = execSync('git --version', { 
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      return {
        status: 'pass',
        message: version,
      };
    } catch {
      return {
        status: 'warn',
        message: 'Git is not installed',
        details: 'Some features require git',
      };
    }
  },
};

/**
 * Check vibecheck configuration exists
 */
export const checkConfig: HealthCheck = {
  id: 'config',
  name: 'Configuration File',
  description: 'Verify .vibecheck/config.json exists',
  category: 'configuration',
  required: false,
  check: async (): Promise<CheckResult> => {
    const configPath = path.join(process.cwd(), '.vibecheck', 'config.json');

    if (!fs.existsSync(configPath)) {
      return {
        status: 'warn',
        message: 'Configuration file not found',
        details: 'Run "vibecheck init" to create config',
        fixAvailable: true,
        fixId: 'create-config',
      };
    }

    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      JSON.parse(content);
      return {
        status: 'pass',
        message: 'Configuration file is valid',
      };
    } catch {
      return {
        status: 'fail',
        message: 'Configuration file is invalid JSON',
        fixAvailable: true,
        fixId: 'fix-config',
      };
    }
  },
};

/**
 * Check .vibecheck directory permissions
 */
export const checkPermissions: HealthCheck = {
  id: 'permissions',
  name: 'Directory Permissions',
  description: 'Verify .vibecheck directory is writable',
  category: 'permissions',
  required: true,
  check: async (): Promise<CheckResult> => {
    const dir = path.join(process.cwd(), '.vibecheck');

    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
        fs.rmdirSync(dir);
        return {
          status: 'pass',
          message: 'Can create .vibecheck directory',
        };
      } catch {
        return {
          status: 'fail',
          message: 'Cannot create .vibecheck directory',
          details: 'Check directory permissions',
        };
      }
    }

    try {
      const testFile = path.join(dir, '.test-write');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      return {
        status: 'pass',
        message: '.vibecheck directory is writable',
      };
    } catch {
      return {
        status: 'fail',
        message: '.vibecheck directory is not writable',
        details: 'Check directory permissions',
      };
    }
  },
};

/**
 * Check TypeScript configuration
 */
export const checkTypeScript: HealthCheck = {
  id: 'typescript',
  name: 'TypeScript',
  description: 'Verify tsconfig.json exists and is valid',
  category: 'configuration',
  required: false,
  check: async (): Promise<CheckResult> => {
    const tsconfigPath = path.join(process.cwd(), 'tsconfig.json');

    if (!fs.existsSync(tsconfigPath)) {
      return {
        status: 'skip',
        message: 'No tsconfig.json found (not a TypeScript project)',
      };
    }

    try {
      const content = fs.readFileSync(tsconfigPath, 'utf-8');
      JSON.parse(content);
      return {
        status: 'pass',
        message: 'tsconfig.json is valid',
      };
    } catch {
      return {
        status: 'warn',
        message: 'tsconfig.json is not valid JSON',
        details: 'Some TypeScript features may not work correctly',
      };
    }
  },
};

// ============================================================================
// All Built-in Checks
// ============================================================================

export const BUILT_IN_CHECKS: HealthCheck[] = [
  checkNodeVersion,
  checkPackageManager,
  checkGit,
  checkConfig,
  checkPermissions,
  checkTypeScript,
];

// ============================================================================
// Doctor Runner
// ============================================================================

/**
 * Run all health checks
 */
export async function runDoctor(
  checks: HealthCheck[] = BUILT_IN_CHECKS
): Promise<DoctorReport> {
  const startTime = Date.now();
  const results: DoctorCheckResult[] = [];

  for (const check of checks) {
    const checkStart = Date.now();
    
    try {
      const result = await check.check();
      result.duration = Date.now() - checkStart;
      
      results.push({
        check: {
          id: check.id,
          name: check.name,
          description: check.description,
          category: check.category,
          required: check.required,
        },
        result,
      });
    } catch (error) {
      results.push({
        check: {
          id: check.id,
          name: check.name,
          description: check.description,
          category: check.category,
          required: check.required,
        },
        result: {
          status: 'fail',
          message: `Check threw error: ${error}`,
          duration: Date.now() - checkStart,
        },
      });
    }
  }

  const summary = calculateSummary(results);
  const status = getOverallStatus(results);

  return {
    status,
    checks: results,
    summary,
    timestamp: new Date().toISOString(),
    totalDuration: Date.now() - startTime,
  };
}

/**
 * Calculate summary statistics
 */
function calculateSummary(results: DoctorCheckResult[]): DoctorSummary {
  return {
    total: results.length,
    passed: results.filter(r => r.result.status === 'pass').length,
    warned: results.filter(r => r.result.status === 'warn').length,
    failed: results.filter(r => r.result.status === 'fail').length,
    skipped: results.filter(r => r.result.status === 'skip').length,
  };
}

/**
 * Get overall status from results
 */
function getOverallStatus(
  results: DoctorCheckResult[]
): DoctorReport['status'] {
  const hasRequiredFailure = results.some(
    r => r.check.required && r.result.status === 'fail'
  );

  if (hasRequiredFailure) {
    return 'unhealthy';
  }

  const hasWarnings = results.some(
    r => r.result.status === 'warn' || r.result.status === 'fail'
  );

  return hasWarnings ? 'warnings' : 'healthy';
}

/**
 * Run a single check by ID
 */
export async function runCheck(
  checkId: string,
  checks: HealthCheck[] = BUILT_IN_CHECKS
): Promise<CheckResult | null> {
  const check = checks.find(c => c.id === checkId);
  
  if (!check) {
    return null;
  }

  return check.check();
}
