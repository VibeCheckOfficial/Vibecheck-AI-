/**
 * Integrations Module
 * 
 * Provides integrations with external services like GitHub.
 * 
 * @module integrations
 */

export {
  GitHubPRClient,
  createGitHubClientFromEnv,
  generatePRCommentMarkdown,
  generateCheckStatus,
  postShipScoreToPR,
} from './github-pr.js';

export type {
  GitHubConfig,
  PRCommentOptions,
  CheckRunOptions,
} from './github-pr.js';
