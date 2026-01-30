/**
 * VibeCheck GitHub Action
 * 
 * Analyzes code for issues and applies/suggests auto-fixes
 * in pull request workflows.
 */

import * as core from '@actions/core';
import * as github from '@actions/github';
import { run } from './action.js';

async function main(): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('An unexpected error occurred');
    }
  }
}

main();
