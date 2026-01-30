/**
 * GitHub PR Integration
 * 
 * Posts Ship Score summaries as PR comments and GitHub Check statuses.
 * 
 * @module integrations/github-pr
 */

import type {
  PRCommentData,
  GitHubCheckStatus,
  GitHubAnnotation,
  ShipScoreBreakdown,
  ReceiptFailure,
} from '@repo/shared-types';

// ============================================================================
// Types
// ============================================================================

/**
 * GitHub API configuration
 */
export interface GitHubConfig {
  /** GitHub API token */
  token: string;
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** API base URL (defaults to github.com) */
  apiBaseUrl?: string;
}

/**
 * PR comment options
 */
export interface PRCommentOptions {
  /** Pull request number */
  prNumber: number;
  /** Update existing comment instead of creating new */
  updateExisting?: boolean;
  /** Comment identifier for updates */
  commentIdentifier?: string;
}

/**
 * Check run options
 */
export interface CheckRunOptions {
  /** Git SHA */
  headSha: string;
  /** Check run name */
  name?: string;
  /** External ID for updates */
  externalId?: string;
}

/**
 * GitHub API response
 */
interface GitHubResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}

// ============================================================================
// PR Comment Markdown Generation
// ============================================================================

/**
 * Generate PR comment markdown from Ship Score data
 */
export function generatePRCommentMarkdown(data: PRCommentData): string {
  const verdictEmoji = {
    SHIP: '\u2705',  // ✅
    WARN: '\u26a0\ufe0f',  // ⚠️
    BLOCK: '\ud83d\uded1',  // 🛑
  };

  const lines: string[] = [];

  // Header with branding
  lines.push('## VibeCheck Report');
  lines.push('');
  
  // Score and verdict
  lines.push(`**Ship Score: ${data.score}/100** ${verdictEmoji[data.verdict]} ${data.verdict}`);
  lines.push('');

  // Dimension breakdown table
  lines.push('| Dimension | Score |');
  lines.push('|-----------|-------|');
  for (const dim of data.dimensions) {
    const bar = generateTextBar(dim.score, dim.maxScore);
    lines.push(`| ${dim.name} | ${dim.score}/${dim.maxScore} ${bar} |`);
  }
  lines.push('');

  // Top blockers
  if (data.blockers.length > 0) {
    lines.push('### Top Blockers');
    lines.push('');
    for (let i = 0; i < Math.min(3, data.blockers.length); i++) {
      const blocker = data.blockers[i];
      lines.push(`${i + 1}. **${blocker.type}**: ${blocker.target}`);
      lines.push(`   ${blocker.message}`);
    }
    if (data.blockers.length > 3) {
      lines.push(`...and ${data.blockers.length - 3} more issues`);
    }
    lines.push('');
  }

  // Actions
  lines.push('---');
  lines.push('');
  
  const actions: string[] = [];
  if (data.reportUrl) {
    actions.push(`[View Full Report](${data.reportUrl})`);
  }
  actions.push('`vibecheck fix -i` to fix issues');
  
  lines.push(actions.join(' | '));
  lines.push('');

  // Footer with metadata
  lines.push(`<sub>Receipt: \`${data.receiptId}\` | Commit: \`${data.commitSha.slice(0, 7)}\` | Branch: \`${data.branch}\`</sub>`);

  return lines.join('\n');
}

/**
 * Generate a simple text progress bar
 */
function generateTextBar(score: number, maxScore: number): string {
  const ratio = score / maxScore;
  const filled = Math.round(ratio * 5);
  const empty = 5 - filled;
  return '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
}

// ============================================================================
// GitHub Check Status Generation
// ============================================================================

/**
 * Generate GitHub Check status from Ship Score
 */
export function generateCheckStatus(
  score: ShipScoreBreakdown,
  failures: ReceiptFailure[] = []
): GitHubCheckStatus {
  const conclusion = getCheckConclusion(score.verdict);
  
  const title = `Ship Score: ${score.total}/100 - ${score.verdict}`;
  
  const summaryLines: string[] = [];
  summaryLines.push(`## ${title}`);
  summaryLines.push('');
  summaryLines.push('### Dimension Breakdown');
  summaryLines.push('');
  summaryLines.push(`- **Ghost Risk**: ${score.dimensions.ghostRisk}/20`);
  summaryLines.push(`- **Auth Coverage**: ${score.dimensions.authCoverage}/20`);
  summaryLines.push(`- **Env Integrity**: ${score.dimensions.envIntegrity}/20`);
  summaryLines.push(`- **Runtime Proof**: ${score.dimensions.runtimeProof}/20`);
  summaryLines.push(`- **Contracts**: ${score.dimensions.contractsAlignment}/20`);
  
  if (failures.length > 0) {
    summaryLines.push('');
    summaryLines.push(`### Issues Found: ${failures.length}`);
    for (const failure of failures.slice(0, 5)) {
      summaryLines.push(`- **${failure.type}**: ${failure.message}`);
    }
    if (failures.length > 5) {
      summaryLines.push(`- ...and ${failures.length - 5} more`);
    }
  }

  // Generate annotations from failures
  const annotations: GitHubAnnotation[] = failures
    .filter(f => f.target && f.target.includes(':'))
    .slice(0, 50) // GitHub limits to 50 annotations
    .map(f => {
      const [path, lineStr] = f.target.split(':');
      const line = parseInt(lineStr, 10) || 1;
      return {
        path,
        startLine: line,
        annotationLevel: f.severity === 'critical' || f.severity === 'high' ? 'failure' : 'warning',
        message: f.message,
        title: f.type,
      };
    });

  return {
    name: 'VibeCheck Ship Gate',
    conclusion,
    title,
    summary: summaryLines.join('\n'),
    annotations: annotations.length > 0 ? annotations : undefined,
  };
}

/**
 * Map verdict to GitHub check conclusion
 */
function getCheckConclusion(verdict: 'SHIP' | 'WARN' | 'BLOCK'): GitHubCheckStatus['conclusion'] {
  switch (verdict) {
    case 'SHIP':
      return 'success';
    case 'WARN':
      return 'neutral';
    case 'BLOCK':
      return 'failure';
  }
}

// ============================================================================
// GitHub API Client
// ============================================================================

/**
 * GitHub API client for PR integration
 */
export class GitHubPRClient {
  private config: GitHubConfig;
  private apiBaseUrl: string;

  constructor(config: GitHubConfig) {
    this.config = config;
    this.apiBaseUrl = config.apiBaseUrl || 'https://api.github.com';
  }

  /**
   * Post a comment on a PR
   */
  async postPRComment(
    prNumber: number,
    body: string,
    options: { updateExisting?: boolean; identifier?: string } = {}
  ): Promise<GitHubResponse<{ id: number; html_url: string }>> {
    const { owner, repo, token } = this.config;

    if (options.updateExisting && options.identifier) {
      // Find existing comment
      const existingComment = await this.findExistingComment(prNumber, options.identifier);
      if (existingComment) {
        // Update existing comment
        return this.updateComment(existingComment.id, body);
      }
    }

    // Create new comment
    const url = `${this.apiBaseUrl}/repos/${owner}/${repo}/issues/${prNumber}/comments`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: `GitHub API error: ${response.status} ${JSON.stringify(errorData)}`,
          statusCode: response.status,
        };
      }

      const data = await response.json();
      return {
        success: true,
        data: { id: data.id, html_url: data.html_url },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Create or update a check run
   */
  async createCheckRun(
    options: CheckRunOptions,
    status: GitHubCheckStatus
  ): Promise<GitHubResponse<{ id: number; html_url: string }>> {
    const { owner, repo, token } = this.config;
    const url = `${this.apiBaseUrl}/repos/${owner}/${repo}/check-runs`;

    const body = {
      name: status.name,
      head_sha: options.headSha,
      status: 'completed' as const,
      conclusion: status.conclusion,
      output: {
        title: status.title,
        summary: status.summary,
        text: status.text,
        annotations: status.annotations,
      },
      external_id: options.externalId,
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: `GitHub API error: ${response.status} ${JSON.stringify(errorData)}`,
          statusCode: response.status,
        };
      }

      const data = await response.json();
      return {
        success: true,
        data: { id: data.id, html_url: data.html_url },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Find an existing comment by identifier
   */
  private async findExistingComment(
    prNumber: number,
    identifier: string
  ): Promise<{ id: number } | null> {
    const { owner, repo, token } = this.config;
    const url = `${this.apiBaseUrl}/repos/${owner}/${repo}/issues/${prNumber}/comments`;

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!response.ok) {
        return null;
      }

      const comments = await response.json();
      const existing = comments.find((c: { body: string; id: number }) =>
        c.body.includes(identifier)
      );

      return existing ? { id: existing.id } : null;
    } catch {
      return null;
    }
  }

  /**
   * Update an existing comment
   */
  private async updateComment(
    commentId: number,
    body: string
  ): Promise<GitHubResponse<{ id: number; html_url: string }>> {
    const { owner, repo, token } = this.config;
    const url = `${this.apiBaseUrl}/repos/${owner}/${repo}/issues/comments/${commentId}`;

    try {
      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: `GitHub API error: ${response.status} ${JSON.stringify(errorData)}`,
          statusCode: response.status,
        };
      }

      const data = await response.json();
      return {
        success: true,
        data: { id: data.id, html_url: data.html_url },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a GitHub PR client from environment
 */
export function createGitHubClientFromEnv(): GitHubPRClient | null {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;

  if (!token || !repo) {
    return null;
  }

  const [owner, repoName] = repo.split('/');
  if (!owner || !repoName) {
    return null;
  }

  return new GitHubPRClient({
    token,
    owner,
    repo: repoName,
    apiBaseUrl: process.env.GITHUB_API_URL,
  });
}

/**
 * Post Ship Score to PR (convenience function)
 */
export async function postShipScoreToPR(
  score: ShipScoreBreakdown,
  prNumber: number,
  options: {
    receiptId: string;
    commitSha: string;
    branch: string;
    blockers?: Array<{ type: string; target: string; message: string }>;
    reportUrl?: string;
    token?: string;
    owner?: string;
    repo?: string;
  }
): Promise<{ success: boolean; commentUrl?: string; error?: string }> {
  // Get client from env or options
  let client: GitHubPRClient | null = null;

  if (options.token && options.owner && options.repo) {
    client = new GitHubPRClient({
      token: options.token,
      owner: options.owner,
      repo: options.repo,
    });
  } else {
    client = createGitHubClientFromEnv();
  }

  if (!client) {
    return {
      success: false,
      error: 'GitHub credentials not configured',
    };
  }

  // Build comment data
  const commentData: PRCommentData = {
    score: score.total,
    verdict: score.verdict,
    dimensions: [
      { name: 'Ghost Risk', score: score.dimensions.ghostRisk, maxScore: 20 },
      { name: 'Auth Coverage', score: score.dimensions.authCoverage, maxScore: 20 },
      { name: 'Env Integrity', score: score.dimensions.envIntegrity, maxScore: 20 },
      { name: 'Runtime Proof', score: score.dimensions.runtimeProof, maxScore: 20 },
      { name: 'Contracts', score: score.dimensions.contractsAlignment, maxScore: 20 },
    ],
    blockers: options.blockers || [],
    reportUrl: options.reportUrl,
    receiptId: options.receiptId,
    commitSha: options.commitSha,
    branch: options.branch,
  };

  // Generate markdown
  const markdown = generatePRCommentMarkdown(commentData);

  // Add identifier for updates
  const commentBody = `<!-- vibecheck-report -->\n${markdown}`;

  // Post comment
  const result = await client.postPRComment(prNumber, commentBody, {
    updateExisting: true,
    identifier: '<!-- vibecheck-report -->',
  });

  return {
    success: result.success,
    commentUrl: result.data?.html_url,
    error: result.error,
  };
}
