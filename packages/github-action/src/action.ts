/**
 * Main action logic for VibeCheck GitHub Action
 * 
 * Includes comprehensive validation, error handling, and security checks.
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import * as exec from '@actions/exec';
import { Octokit } from '@octokit/rest';
import path from 'node:path';
import fs from 'node:fs/promises';
import {
  AutoFixOrchestrator,
  ReviewPipeline,
  SilentFailureFixModule,
  AuthGapFixModule,
  EnvVarFixModule,
  GhostRouteFixModule,
  type Issue,
  type ProposedFix,
  type AutoFixPolicy,
  DEFAULT_AUTOFIX_POLICY,
} from '@vibecheck/core/autofix';
import { DriftDetector } from '@vibecheck/core/validation';

/**
 * Valid action modes
 */
const VALID_MODES = ['suggest', 'auto-commit'] as const;
type ActionMode = typeof VALID_MODES[number];

/**
 * Safety limits for the action
 */
const LIMITS = {
  MAX_FIXES: 50,
  MAX_ISSUES: 100,
  MAX_FILES_TO_COMMIT: 20,
  MIN_CONFIDENCE: 0.5,
  MAX_CONFIDENCE: 1.0,
  MAX_COMMIT_MESSAGE_LENGTH: 500,
  MAX_CONFIG_FILE_SIZE: 100 * 1024, // 100KB
  EXECUTION_TIMEOUT_MS: 5 * 60 * 1000, // 5 minutes
} as const;

/**
 * Action inputs
 */
interface ActionInputs {
  mode: ActionMode;
  token: string;
  configPath: string;
  confidenceThreshold: number;
  maxFixes: number;
  failOnIssues: boolean;
  commitMessage: string;
}

/**
 * Action outputs
 */
interface ActionOutputs {
  issuesFound: number;
  fixesApplied: number;
  fixesSuggested: number;
  prCommentUrl?: string;
  errors?: string[];
}

/**
 * Validate and sanitize action mode
 */
function validateMode(mode: string): ActionMode {
  const normalized = mode.toLowerCase().trim();
  if (VALID_MODES.includes(normalized as ActionMode)) {
    return normalized as ActionMode;
  }
  core.warning(`Invalid mode "${mode}", defaulting to "suggest"`);
  return 'suggest';
}

/**
 * Validate confidence threshold
 */
function validateConfidence(value: number): number {
  if (!Number.isFinite(value)) {
    core.warning('Invalid confidence threshold, using default 0.85');
    return 0.85;
  }
  if (value < LIMITS.MIN_CONFIDENCE) {
    core.warning(`Confidence threshold ${value} below minimum, using ${LIMITS.MIN_CONFIDENCE}`);
    return LIMITS.MIN_CONFIDENCE;
  }
  if (value > LIMITS.MAX_CONFIDENCE) {
    return LIMITS.MAX_CONFIDENCE;
  }
  return value;
}

/**
 * Validate max fixes
 */
function validateMaxFixes(value: number): number {
  if (!Number.isFinite(value) || value < 1) {
    core.warning('Invalid max-fixes, using default 10');
    return 10;
  }
  if (value > LIMITS.MAX_FIXES) {
    core.warning(`max-fixes ${value} exceeds limit, using ${LIMITS.MAX_FIXES}`);
    return LIMITS.MAX_FIXES;
  }
  return Math.floor(value);
}

/**
 * Sanitize commit message
 */
function sanitizeCommitMessage(message: string): string {
  if (!message || typeof message !== 'string') {
    return '[vibecheck] Applied auto-fix:';
  }
  
  return message
    .slice(0, LIMITS.MAX_COMMIT_MESSAGE_LENGTH)
    .replace(/[<>]/g, '') // Prevent injection
    .trim() || '[vibecheck] Applied auto-fix:';
}

/**
 * Get action inputs with validation
 */
function getInputs(): ActionInputs {
  const rawMode = core.getInput('mode') || 'suggest';
  const rawConfidence = parseFloat(core.getInput('confidence-threshold'));
  const rawMaxFixes = parseInt(core.getInput('max-fixes'), 10);
  const rawCommitMessage = core.getInput('commit-message') || '[vibecheck] Applied auto-fix:';

  const token = core.getInput('token', { required: true });
  if (!token || token.length < 10) {
    throw new Error('Invalid or missing GitHub token');
  }

  return {
    mode: validateMode(rawMode),
    token,
    configPath: core.getInput('config-path') || '.vibecheck/policy.json',
    confidenceThreshold: validateConfidence(isNaN(rawConfidence) ? 0.85 : rawConfidence),
    maxFixes: validateMaxFixes(isNaN(rawMaxFixes) ? 10 : rawMaxFixes),
    failOnIssues: core.getInput('fail-on-issues') === 'true',
    commitMessage: sanitizeCommitMessage(rawCommitMessage),
  };
}

/**
 * Set action outputs
 */
function setOutputs(outputs: ActionOutputs): void {
  core.setOutput('issues-found', outputs.issuesFound);
  core.setOutput('fixes-applied', outputs.fixesApplied);
  core.setOutput('fixes-suggested', outputs.fixesSuggested);
  if (outputs.prCommentUrl) {
    core.setOutput('pr-comment-url', outputs.prCommentUrl);
  }
}

/**
 * Load configuration from file with validation
 */
async function loadConfig(configPath: string): Promise<{ autofix: Partial<AutoFixPolicy> }> {
  // Sanitize config path
  const sanitizedPath = configPath
    .replace(/\.\./g, '') // Prevent path traversal
    .replace(/^\//, ''); // Remove leading slash
  
  const fullPath = path.resolve(process.cwd(), sanitizedPath);
  
  // Ensure path is within project
  const projectRoot = process.cwd();
  if (!fullPath.startsWith(projectRoot)) {
    core.warning('Config path outside project directory, using defaults');
    return { autofix: {} };
  }
  
  try {
    // Check file size before reading
    const stats = await fs.stat(fullPath);
    if (stats.size > LIMITS.MAX_CONFIG_FILE_SIZE) {
      core.warning(`Config file too large (${stats.size} bytes), using defaults`);
      return { autofix: {} };
    }

    const content = await fs.readFile(fullPath, 'utf-8');
    
    // Parse and validate
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      core.warning(`Invalid JSON in config file: ${parseError instanceof Error ? parseError.message : 'parse error'}`);
      return { autofix: {} };
    }
    
    // Validate structure
    if (!parsed || typeof parsed !== 'object') {
      core.warning('Config file is not an object, using defaults');
      return { autofix: {} };
    }
    
    const config = parsed as Record<string, unknown>;
    const autofix = config.autofix && typeof config.autofix === 'object' 
      ? config.autofix as Partial<AutoFixPolicy>
      : {};
    
    return { autofix };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      core.warning(`Config file not found at ${configPath}, using defaults`);
    } else {
      core.warning(`Error loading config: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
    return { autofix: {} };
  }
}

/**
 * Collect issues from the codebase with limits
 */
async function collectIssues(projectRoot: string, truthpackPath: string): Promise<Issue[]> {
  const issues: Issue[] = [];

  try {
    // Collect from drift detection
    const detector = new DriftDetector({
      projectRoot,
      truthpackPath,
      ignorePatterns: [
        'node_modules/**',
        'dist/**',
        '.git/**',
        'coverage/**',
        '*.min.js',
        '*.bundle.js',
      ],
    });

    const report = await detector.detect();
    if (report.hasDrift && report.items) {
      const convertedIssues = AutoFixOrchestrator.driftItemsToIssues(report.items);
      
      // Limit issues to prevent overwhelming the action
      issues.push(...convertedIssues.slice(0, LIMITS.MAX_ISSUES));
      
      if (convertedIssues.length > LIMITS.MAX_ISSUES) {
        core.warning(`Found ${convertedIssues.length} issues, processing only first ${LIMITS.MAX_ISSUES}`);
      }
    }
  } catch (error) {
    core.warning(`Issue collection error: ${error instanceof Error ? error.message : 'unknown error'}`);
  }

  return issues;
}

/**
 * Create PR comment with fix suggestions
 */
async function createPRComment(
  octokit: Octokit,
  context: typeof github.context,
  pipeline: ReviewPipeline
): Promise<string | undefined> {
  if (!context.payload.pull_request) {
    core.warning('Not running in PR context, skipping comment');
    return undefined;
  }

  const prNumber = context.payload.pull_request.number;
  if (!Number.isFinite(prNumber) || prNumber < 1) {
    core.warning('Invalid PR number, skipping comment');
    return undefined;
  }

  const owner = context.repo.owner;
  const repo = context.repo.repo;

  // Validate owner and repo
  if (!owner || !repo || typeof owner !== 'string' || typeof repo !== 'string') {
    core.warning('Invalid repository context, skipping comment');
    return undefined;
  }

  try {
    const body = pipeline.generatePRComment();
    
    // Limit comment body size (GitHub limit is 65536)
    const maxBodyLength = 60000;
    const truncatedBody = body.length > maxBodyLength
      ? body.slice(0, maxBodyLength) + '\n\n... (truncated)'
      : body;

    const response = await octokit.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: truncatedBody,
    });

    return response.data.html_url;
  } catch (error) {
    core.warning(`Failed to create PR comment: ${error instanceof Error ? error.message : 'unknown error'}`);
    return undefined;
  }
}

/**
 * Commit and push fixes with safety checks
 */
async function commitFixes(
  appliedFixes: ProposedFix[],
  commitMessage: string
): Promise<void> {
  if (appliedFixes.length === 0) {
    core.info('No fixes to commit');
    return;
  }

  // Stage all changed files with validation
  const files = [...new Set(appliedFixes.map((f) => f.patch.filePath))]
    .filter((file) => {
      // Skip files that could be dangerous to commit
      if (!file || typeof file !== 'string') return false;
      if (file.includes('..')) return false;
      if (file.startsWith('/')) return false;
      if (file.includes('.env')) return false;
      if (file.includes('credentials')) return false;
      if (file.includes('secret')) return false;
      return true;
    })
    .slice(0, LIMITS.MAX_FILES_TO_COMMIT);

  if (files.length === 0) {
    core.warning('No safe files to commit');
    return;
  }

  if (files.length < appliedFixes.length) {
    core.warning(`Only committing ${files.length} of ${appliedFixes.length} files (some filtered for safety)`);
  }
  
  for (const file of files) {
    try {
      await exec.exec('git', ['add', file]);
    } catch (error) {
      core.warning(`Failed to stage file ${file}: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  // Create commit with sanitized message
  const descriptions = appliedFixes
    .slice(0, 20) // Limit descriptions in commit message
    .map((f) => `- ${f.description.slice(0, 100)}`)
    .join('\n');
  
  const fullMessage = `${commitMessage} ${appliedFixes.length} fix(es)\n\n${descriptions}`;
  
  // Use -- to separate message from potential malicious file names
  try {
    await exec.exec('git', ['commit', '-m', fullMessage, '--']);
    await exec.exec('git', ['push']);
    core.info(`Successfully committed and pushed ${files.length} file(s)`);
  } catch (error) {
    core.error(`Commit failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    throw error;
  }
}

/**
 * Set status check with validation
 */
async function setStatusCheck(
  octokit: Octokit,
  context: typeof github.context,
  state: 'success' | 'failure' | 'pending',
  description: string
): Promise<void> {
  const sha = context.payload.pull_request?.head?.sha ?? context.sha;
  
  // Validate SHA format
  if (!sha || typeof sha !== 'string' || !/^[a-f0-9]{40}$/i.test(sha)) {
    core.warning('Invalid commit SHA, skipping status check');
    return;
  }

  const owner = context.repo.owner;
  const repo = context.repo.repo;

  if (!owner || !repo) {
    core.warning('Invalid repository context, skipping status check');
    return;
  }

  // Truncate description (GitHub limit is 140 chars)
  const truncatedDescription = description.slice(0, 140);

  try {
    await octokit.repos.createCommitStatus({
      owner,
      repo,
      sha,
      state,
      description: truncatedDescription,
      context: 'VibeCheck Auto-Fix',
    });
  } catch (error) {
    core.warning(`Failed to set status check: ${error instanceof Error ? error.message : 'unknown'}`);
  }
}

/**
 * Main action entry point with comprehensive error handling
 */
export async function run(): Promise<void> {
  const errors: string[] = [];
  let octokit: Octokit | null = null;
  let inputs: ActionInputs;

  try {
    inputs = getInputs();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to parse inputs';
    core.setFailed(message);
    return;
  }

  const context = github.context;
  
  try {
    octokit = new Octokit({ auth: inputs.token });
  } catch (error) {
    core.setFailed('Failed to initialize GitHub client - check your token');
    return;
  }

  core.info('Starting VibeCheck Auto-Fix analysis...');
  core.info(`Mode: ${inputs.mode}`);
  core.info(`Confidence threshold: ${inputs.confidenceThreshold}`);
  core.info(`Max fixes: ${inputs.maxFixes}`);

  // Load configuration
  const config = await loadConfig(inputs.configPath);
  const policy: AutoFixPolicy = {
    ...DEFAULT_AUTOFIX_POLICY,
    ...config.autofix,
    confidenceThreshold: inputs.confidenceThreshold,
  };

  const projectRoot = process.cwd();
  const truthpackPath = path.join(projectRoot, '.vibecheck', 'truthpack');

  // Set pending status
  await setStatusCheck(octokit, context, 'pending', 'Analyzing code...');

  // Set up timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Action timed out')), LIMITS.EXECUTION_TIMEOUT_MS);
  });

  try {
    await Promise.race([
      runAnalysis(inputs, octokit, context, policy, projectRoot, truthpackPath, errors),
      timeoutPromise,
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    errors.push(message);
    
    await setStatusCheck(octokit, context, 'failure', `Error: ${message.slice(0, 100)}`);
    
    // Set outputs even on failure
    setOutputs({
      issuesFound: 0,
      fixesApplied: 0,
      fixesSuggested: 0,
      errors,
    });
    
    core.setFailed(message);
  }
}

/**
 * Run the main analysis logic
 */
async function runAnalysis(
  inputs: ActionInputs,
  octokit: Octokit,
  context: typeof github.context,
  policy: AutoFixPolicy,
  projectRoot: string,
  truthpackPath: string,
  errors: string[]
): Promise<void> {
  // Collect issues
  core.info('Collecting issues...');
  const issues = await collectIssues(projectRoot, truthpackPath);
  core.info(`Found ${issues.length} issue(s)`);

  if (issues.length === 0) {
    await setStatusCheck(octokit, context, 'success', 'No issues found');
    setOutputs({
      issuesFound: 0,
      fixesApplied: 0,
      fixesSuggested: 0,
    });
    return;
  }

  // Initialize orchestrator
  let orchestrator: AutoFixOrchestrator;
  try {
    orchestrator = new AutoFixOrchestrator({
      projectRoot,
      truthpackPath,
      policy,
      dryRun: inputs.mode === 'suggest',
      maxIssuesPerRun: inputs.maxFixes,
    });

    // Register fix modules
    orchestrator.registerModule(new SilentFailureFixModule());
    orchestrator.registerModule(new AuthGapFixModule());
    orchestrator.registerModule(new EnvVarFixModule());
    orchestrator.registerModule(new GhostRouteFixModule());
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to initialize';
    errors.push(`Orchestrator init: ${message}`);
    throw error;
  }

  // Process issues
  core.info('Processing issues...');
  const result = await orchestrator.processIssues(issues.slice(0, inputs.maxFixes));

  // Collect processing errors
  if (result.errors) {
    for (const err of result.errors.slice(0, 5)) {
      errors.push(`${err.phase}: ${err.message}`);
    }
  }

  // Create review pipeline
  const pipeline = new ReviewPipeline(projectRoot, policy);
  const { autoApplied, queued, rejected } = await pipeline.process(result);

  // Handle based on mode
  let prCommentUrl: string | undefined;
  let appliedCount = autoApplied.length;

  if (inputs.mode === 'auto-commit') {
    // In auto-commit mode, also apply suggested fixes with high confidence
    const highConfidenceSuggestions = queued.filter(
      (item) => item.fix.confidence.value >= inputs.confidenceThreshold
    );

    for (const item of highConfidenceSuggestions) {
      pipeline.approve(item.id, 'github-action');
    }

    try {
      const applyResults = await pipeline.applyApproved();
      const successfulApplies = applyResults.filter((r) => r.success);
      appliedCount += successfulApplies.length;

      // Report failures
      const failures = applyResults.filter((r) => !r.success);
      for (const failure of failures.slice(0, 3)) {
        errors.push(`Apply failed: ${failure.filePath} - ${failure.error}`);
      }

      // Commit the changes
      if (appliedCount > 0) {
        core.info(`Committing ${appliedCount} fix(es)...`);
        await commitFixes(
          [...autoApplied, ...highConfidenceSuggestions.map((i) => i.fix)],
          inputs.commitMessage
        );
      }
    } catch (commitError) {
      const message = commitError instanceof Error ? commitError.message : 'Commit failed';
      errors.push(message);
      core.warning(`Commit error: ${message}`);
    }
  }

  // Always post PR comment with details
  if (context.payload.pull_request) {
    core.info('Creating PR comment...');
    prCommentUrl = await createPRComment(octokit, context, pipeline);
  }

  // Set outputs
  const outputs: ActionOutputs = {
    issuesFound: result.totalIssues,
    fixesApplied: appliedCount,
    fixesSuggested: pipeline.getPending().length,
    prCommentUrl,
    errors: errors.length > 0 ? errors : undefined,
  };
  setOutputs(outputs);

  // Set final status
  const unfixedBlockers = result.unfixableIssues.filter(
    (i) => i.severity === 'high' || i.severity === 'critical'
  );

  if (unfixedBlockers.length > 0 && inputs.failOnIssues) {
    await setStatusCheck(
      octokit,
      context,
      'failure',
      `${unfixedBlockers.length} unfixable blocker(s)`
    );
    core.setFailed(`Found ${unfixedBlockers.length} unfixable blocking issue(s)`);
  } else if (pipeline.getPending().length > 0) {
    await setStatusCheck(
      octokit,
      context,
      'success',
      `${pipeline.getPending().length} fix(es) pending review`
    );
  } else {
    await setStatusCheck(
      octokit,
      context,
      'success',
      appliedCount > 0 ? `${appliedCount} fix(es) applied` : 'All checks passed'
    );
  }

  // Summary
  core.info('');
  core.info('=== VibeCheck Auto-Fix Summary ===');
  core.info(`Issues found: ${result.totalIssues}`);
  core.info(`Fixes applied: ${appliedCount}`);
  core.info(`Fixes suggested: ${pipeline.getPending().length}`);
  core.info(`Fixes rejected: ${rejected.length}`);
  
  if (errors.length > 0) {
    core.info(`Errors: ${errors.length}`);
    for (const err of errors.slice(0, 5)) {
      core.warning(`  - ${err}`);
    }
  }
}
