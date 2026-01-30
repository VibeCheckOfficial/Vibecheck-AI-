/**
 * Doctor command - Validate system dependencies and configuration
 * 
 * Cross-platform validation without OS-specific assumptions
 */

import { createLogger } from '../lib/index.js';
import { getEnvironment } from '../lib/environment.js';
import { renderCommandHeader } from '../ui/index.js';
import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import type { DoctorOptions } from '../types.js';

interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  suggestion?: string;
}

/**
 * Check Node.js version
 */
function checkNodeVersion(): CheckResult {
  const env = getEnvironment();
  const { major, minor } = env.nodeVersion;
  
  if (major < 18) {
    return {
      name: 'Node.js Version',
      status: 'fail',
      message: `Node.js ${process.version} is installed (18+ required)`,
      suggestion: 'Upgrade Node.js using nvm, n, or download from nodejs.org',
    };
  }
  
  if (major === 18 && minor < 17) {
    return {
      name: 'Node.js Version',
      status: 'warn',
      message: `Node.js ${process.version} is installed (18.17+ recommended)`,
      suggestion: 'Consider upgrading to Node.js 18.17+ for better performance',
    };
  }
  
  return {
    name: 'Node.js Version',
    status: 'pass',
    message: `Node.js ${process.version} is installed`,
  };
}

/**
 * Check available memory
 */
function checkMemory(): CheckResult {
  const totalMB = Math.floor(os.totalmem() / 1024 / 1024);
  const freeMB = Math.floor(os.freemem() / 1024 / 1024);
  const minRequiredMB = 512;
  
  if (freeMB < minRequiredMB) {
    return {
      name: 'Available Memory',
      status: 'warn',
      message: `${freeMB}MB free (${totalMB}MB total)`,
      suggestion: `At least ${minRequiredMB}MB free memory recommended. Close other applications.`,
    };
  }
  
  return {
    name: 'Available Memory',
    status: 'pass',
    message: `${freeMB}MB free (${totalMB}MB total)`,
  };
}

/**
 * Check disk space
 */
async function checkDiskSpace(): Promise<CheckResult> {
  // Cross-platform disk space check is complex
  // For now, we'll do a simple write test as a proxy
  try {
    const testFile = path.join(os.tmpdir(), `vibecheck-disk-test-${Date.now()}`);
    await fs.writeFile(testFile, 'test');
    await fs.unlink(testFile);
    
    return {
      name: 'Disk Space',
      status: 'pass',
      message: 'Disk space check passed (write test)',
    };
  } catch (error) {
    return {
      name: 'Disk Space',
      status: 'warn',
      message: `Disk space check failed: ${error instanceof Error ? error.message : String(error)}`,
      suggestion: 'Ensure sufficient disk space is available',
    };
  }
}

/**
 * Check write permissions
 */
async function checkWritePermissions(): Promise<CheckResult> {
  try {
    const testFile = path.join(process.cwd(), '.vibecheck', '.write-test');
    const testDir = path.dirname(testFile);
    
    // Ensure directory exists
    await fs.mkdir(testDir, { recursive: true });
    
    // Try to write
    await fs.writeFile(testFile, 'test');
    await fs.unlink(testFile);
    
    return {
      name: 'Write Permissions',
      status: 'pass',
      message: 'Can write to .vibecheck directory',
    };
  } catch (error) {
    return {
      name: 'Write Permissions',
      status: 'fail',
      message: `Cannot write to .vibecheck directory: ${error instanceof Error ? error.message : String(error)}`,
      suggestion: 'Check directory permissions or run with appropriate privileges',
    };
  }
}

/**
 * Check temp directory access
 */
async function checkTempDirectory(): Promise<CheckResult> {
  try {
    const tempDir = os.tmpdir();
    const testFile = path.join(tempDir, `vibecheck-test-${Date.now()}`);
    
    await fs.writeFile(testFile, 'test');
    await fs.unlink(testFile);
    
    return {
      name: 'Temp Directory',
      status: 'pass',
      message: `Can write to ${tempDir}`,
    };
  } catch (error) {
    return {
      name: 'Temp Directory',
      status: 'fail',
      message: `Cannot write to temp directory: ${error instanceof Error ? error.message : String(error)}`,
      suggestion: 'Check temp directory permissions',
    };
  }
}

/**
 * Check required dependencies
 */
async function checkDependencies(): Promise<CheckResult> {
  // Check if we can import core package (indirect dependency check)
  try {
    // Try to require/import the core package
    await import('@vibecheck/core');
    return {
      name: 'Dependencies',
      status: 'pass',
      message: 'Core dependencies available',
    };
  } catch (error) {
    return {
      name: 'Dependencies',
      status: 'warn',
      message: `Core package check: ${error instanceof Error ? error.message : String(error)}`,
      suggestion: 'Ensure @vibecheck/core is installed. Run: pnpm install',
    };
  }
}

/**
 * Check platform compatibility
 */
function checkPlatform(): CheckResult {
  const env = getEnvironment();
  const supported = ['win32', 'darwin', 'linux'];
  
  if (!supported.includes(env.platform)) {
    return {
      name: 'Platform',
      status: 'warn',
      message: `Platform ${env.platform} may not be fully supported`,
      suggestion: 'Test thoroughly. Supported platforms: Windows, macOS, Linux',
    };
  }
  
  return {
    name: 'Platform',
    status: 'pass',
    message: `Platform ${env.platform} is supported`,
  };
}

/**
 * Run all checks
 */
export async function doctorCommand(options: DoctorOptions): Promise<void> {
  const logger = createLogger({
    level: options.verbose ? 'verbose' : 'normal',
    json: options.json,
  });

  const startTime = Date.now();
  const checks: CheckResult[] = [];

  // Show beautiful command header in interactive mode
  if (!options.json) {
    renderCommandHeader({
      command: 'doctor',
      target: process.cwd(),
      elapsedTime: 0,
    });
  }

  // Run synchronous checks
  checks.push(checkNodeVersion());
  checks.push(checkMemory());
  checks.push(checkPlatform());

  // Run asynchronous checks
  checks.push(await checkDiskSpace());
  checks.push(await checkWritePermissions());
  checks.push(await checkTempDirectory());
  checks.push(await checkDependencies());

  const duration = Date.now() - startTime;

  // Calculate health metrics
  const passCount = checks.filter(c => c.status === 'pass').length;
  const failCount = checks.filter(c => c.status === 'fail').length;
  const warnCount = checks.filter(c => c.status === 'warn').length;
  const totalChecks = checks.length;
  const healthPercentage = (passCount / totalChecks) * 100;
  const healthStatus: 'optimal' | 'stable' | 'warning' | 'critical' = 
    failCount === 0 && warnCount === 0 ? 'optimal' :
    failCount === 0 ? 'stable' :
    failCount <= 2 ? 'warning' : 'critical';

  // Output results
  if (options.json) {
    const result = {
      status: checks.every(c => c.status === 'pass') ? 'pass' : 
              checks.some(c => c.status === 'fail') ? 'fail' : 'warn',
      checks: checks.map(c => ({
        name: c.name,
        status: c.status,
        message: c.message,
        suggestion: c.suggestion,
      })),
    };
    console.log(JSON.stringify(result, null, 2));
    process.exit(checks.some(c => c.status === 'fail') ? 1 : 0);
    return;
  }

  // Show updated header with results in interactive mode
  if (!options.json) {
    const diagnostics: Array<{ level: 'pass' | 'fail' | 'warn' | 'info'; message: string; details?: string }> = [];
    
    for (const check of checks) {
      if (check.status === 'fail') {
        diagnostics.push({
          level: 'fail',
          message: check.name,
          details: check.message,
        });
      } else if (check.status === 'warn') {
        diagnostics.push({
          level: 'warn',
          message: check.name,
          details: check.message,
        });
      }
    }

    if (failCount === 0 && warnCount === 0) {
      diagnostics.push({
        level: 'pass',
        message: 'All system checks passed',
      });
    }

    const actionRequired = failCount > 0 ? {
      title: 'ACTION REQUIRED',
      message: '[!] System configuration issues detected. Please resolve before proceeding.',
      suggestions: checks
        .filter(c => c.status === 'fail' && c.suggestion)
        .map(c => ({
          command: c.suggestion!,
          description: `Fix: ${c.name}`,
        })),
    } : undefined;

    renderCommandHeader({
      command: 'doctor',
      target: process.cwd(),
      elapsedTime: duration,
      vitals: [
        {
          label: 'SYSTEM HEALTH',
          status: healthStatus,
          value: `${passCount}/${totalChecks} passed`,
          percentage: healthPercentage,
        },
        {
          label: 'NODE VERSION',
          status: checks.find(c => c.name === 'Node.js Version')?.status === 'pass' ? 'optimal' : 'critical',
          value: process.version,
          percentage: checks.find(c => c.name === 'Node.js Version')?.status === 'pass' ? 100 : 0,
        },
        {
          label: 'MEMORY',
          status: checks.find(c => c.name === 'Available Memory')?.status === 'pass' ? 'optimal' : 'warning',
          value: `${Math.floor(os.freemem() / 1024 / 1024)}MB free`,
          percentage: checks.find(c => c.name === 'Available Memory')?.status === 'pass' ? 100 : 50,
        },
      ],
      diagnostics,
      securityAudit: checks
        .filter(c => c.name.includes('Permission') || c.name.includes('Dependency'))
        .map(c => ({
          check: c.name,
          status: c.status === 'pass' ? 'pass' as const : c.status === 'warn' ? 'warn' as const : 'fail' as const,
        })),
      actionRequired,
    });
  }

  // Also show traditional output for compatibility
  const symbols = {
    pass: '✓',
    fail: '✖',
    warn: '⚠',
  };

  const colors = {
    pass: logger.success.bind(logger),
    fail: logger.error.bind(logger),
    warn: logger.warn.bind(logger),
  };

  for (const check of checks) {
    const symbol = symbols[check.status];
    const colorFn = colors[check.status];
    colorFn(`${symbol} ${check.name}: ${check.message}`);
    
    if (check.suggestion) {
      logger.dim(`  → ${check.suggestion}`);
    }
  }

  logger.newline();

  // Show updated header with results in interactive mode
  if (!options.json) {
    const diagnostics: Array<{ level: 'pass' | 'fail' | 'warn' | 'info'; message: string; details?: string }> = [];
    
    for (const check of checks) {
      if (check.status === 'fail') {
        diagnostics.push({
          level: 'fail',
          message: check.name,
          details: check.message,
        });
      } else if (check.status === 'warn') {
        diagnostics.push({
          level: 'warn',
          message: check.name,
          details: check.message,
        });
      }
    }

    if (failCount === 0 && warnCount === 0) {
      diagnostics.push({
        level: 'pass',
        message: 'All system checks passed',
      });
    }

    const actionRequired = failCount > 0 ? {
      title: 'ACTION REQUIRED',
      message: '[!] System configuration issues detected. Please resolve before proceeding.',
      suggestions: checks
        .filter(c => c.status === 'fail' && c.suggestion)
        .map(c => ({
          command: c.suggestion!,
          description: `Fix: ${c.name}`,
        })),
    } : undefined;

    renderCommandHeader({
      command: 'doctor',
      target: process.cwd(),
      elapsedTime: duration,
      vitals: [
        {
          label: 'SYSTEM HEALTH',
          status: healthStatus,
          value: `${passCount}/${totalChecks} passed`,
          percentage: healthPercentage,
        },
        {
          label: 'NODE VERSION',
          status: checks.find(c => c.name === 'Node.js Version')?.status === 'pass' ? 'optimal' : 'critical',
          value: process.version,
          percentage: checks.find(c => c.name === 'Node.js Version')?.status === 'pass' ? 100 : 0,
        },
        {
          label: 'MEMORY',
          status: checks.find(c => c.name === 'Available Memory')?.status === 'pass' ? 'optimal' : 'warning',
          value: `${Math.floor(os.freemem() / 1024 / 1024)}MB free`,
          percentage: checks.find(c => c.name === 'Available Memory')?.status === 'pass' ? 100 : 50,
        },
      ],
      diagnostics,
      securityAudit: checks
        .filter(c => c.name.includes('Permission') || c.name.includes('Dependency'))
        .map(c => ({
          check: c.name,
          status: c.status === 'pass' ? 'pass' as const : c.status === 'warn' ? 'warn' as const : 'fail' as const,
        })),
      actionRequired,
    });
  }

  if (failCount > 0) {
    logger.error(`${failCount} check(s) failed`);
    process.exit(1);
  } else if (warnCount > 0) {
    logger.warn(`${warnCount} warning(s) - system may not be optimal`);
    process.exit(0);
  } else {
    logger.success(`All ${passCount} checks passed`);
    process.exit(0);
  }
}
