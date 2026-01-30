/**
 * Reality Check Uploader
 * 
 * Handles uploading reality check video recordings and results to the API.
 * Uses stored credentials from `vibecheck login` or environment variables.
 * 
 * @module lib/reality-uploader
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createVideoStorageService, type VideoUploadResult } from '@vibecheck/core';
import type { RealityModeOutput } from '@vibecheck/core/reality';
import { getAuthToken, getApiUrl, getWebUrl, isLoggedIn } from './credentials.js';

// ============================================================================
// Types
// ============================================================================

export interface RealityCheckUploadResult {
  /** ID of the created reality check record */
  id: string;
  /** URL of the uploaded video */
  videoUrl?: string;
  /** URL of the video thumbnail */
  thumbnailUrl?: string;
  /** Video duration in seconds */
  videoDuration?: number;
  /** Uploaded screenshot URLs */
  screenshots: Array<{
    url: string;
    timestamp: number;
    route?: string;
  }>;
  /** API URL for the reality check */
  dashboardUrl?: string;
}

export interface RealityCheckPayload {
  projectId: string;
  scanId?: string;
  baseUrl: string;
  headless: boolean;
  chaosEnabled: boolean;
  status: 'completed' | 'failed';
  verdict: 'SHIP' | 'WARN' | 'BLOCK' | null;
  routesVerified: number;
  routesTotal: number;
  findingsCount: number;
  videoUrl?: string;
  videoThumbnailUrl?: string;
  videoDuration?: number;
  screenshots?: Array<{ url: string; timestamp: number; route?: string }>;
  findings?: unknown[];
  routeResults?: unknown[];
  chaosResults?: unknown[];
  startedAt?: string;
  completedAt?: string;
}

// ============================================================================
// Upload Functions
// ============================================================================

/**
 * Upload video artifacts to object storage.
 */
export async function uploadVideoArtifacts(
  artifactsDir: string,
  projectId: string,
  checkId: string
): Promise<VideoUploadResult | null> {
  try {
    const storageService = createVideoStorageService();
    const result = await storageService.uploadRealityCheckArtifacts(
      artifactsDir,
      projectId,
      checkId
    );
    return result.videoUrl ? result : null;
  } catch (error) {
    // Storage might not be configured - that's okay in local dev
    const message = error instanceof Error ? error.message : String(error);
    if (process.env.VIBECHECK_DEBUG) {
      console.warn(`Video upload skipped: ${message}`);
    }
    return null;
  }
}

/**
 * Map runtime verdict to API verdict format.
 */
function mapVerdict(verdict: string): 'SHIP' | 'WARN' | 'BLOCK' | null {
  switch (verdict) {
    case 'pass':
      return 'SHIP';
    case 'warn':
      return 'WARN';
    case 'fail':
      return 'BLOCK';
    default:
      return null;
  }
}

/**
 * Create a reality check record in the API.
 */
export async function createRealityCheckRecord(
  apiUrl: string,
  authToken: string,
  payload: RealityCheckPayload
): Promise<{ id: string } | null> {
  try {
    const response = await fetch(`${apiUrl}/api/v1/reality-checks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.warn(`Failed to create reality check record: ${response.status} - ${errorBody}`);
      return null;
    }

    const data = await response.json() as { realityCheck: { id: string } };
    return { id: data.realityCheck.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (process.env.VIBECHECK_DEBUG) {
      console.warn(`API request failed: ${message}`);
    }
    return null;
  }
}

/**
 * Update an existing reality check record with video URLs.
 */
export async function updateRealityCheckWithVideos(
  apiUrl: string,
  authToken: string,
  checkId: string,
  videoData: {
    videoUrl?: string;
    thumbnailUrl?: string;
    duration?: number;
    screenshots?: Array<{ url: string; timestamp: number; route?: string }>;
  }
): Promise<boolean> {
  try {
    const response = await fetch(`${apiUrl}/api/v1/reality-checks/${checkId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        videoUrl: videoData.videoUrl,
        videoThumbnailUrl: videoData.thumbnailUrl,
        videoDuration: videoData.duration,
        screenshots: videoData.screenshots,
      }),
    });

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Upload reality check results and video to the API.
 * This is the main function to call after a reality check completes.
 * 
 * Uses credentials from:
 * 1. Function parameters (if provided)
 * 2. Environment variables (VIBECHECK_AUTH_TOKEN, etc.)
 * 3. Stored credentials from `vibecheck login`
 */
export async function uploadRealityCheckResults(
  result: RealityModeOutput,
  options: {
    projectId: string;
    scanId?: string;
    baseUrl: string;
    headless: boolean;
    chaosEnabled: boolean;
    apiUrl?: string;
    authToken?: string;
    webUrl?: string;
  }
): Promise<RealityCheckUploadResult | null> {
  const {
    projectId,
    scanId,
    baseUrl,
    headless,
    chaosEnabled,
  } = options;

  // Get credentials from options, env vars, or stored credentials
  const apiUrl = options.apiUrl ?? await getApiUrl();
  const authToken = options.authToken ?? await getAuthToken();
  const webUrl = options.webUrl ?? await getWebUrl();

  // No auth token - skip upload
  if (!authToken) {
    if (process.env.VIBECHECK_DEBUG) {
      console.log('API upload skipped: Not logged in. Run `vibecheck login` to enable cloud sync.');
    }
    return null;
  }

  // Generate a unique check ID
  const checkId = `rc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  // First, upload video artifacts to storage
  let videoUpload: VideoUploadResult | null = null;
  if (result.artifactsDir) {
    videoUpload = await uploadVideoArtifacts(result.artifactsDir, projectId, checkId);
  }

  // Prepare the payload
  const payload: RealityCheckPayload = {
    projectId,
    scanId,
    baseUrl,
    headless,
    chaosEnabled,
    status: result.summary.verdict === 'fail' ? 'failed' : 'completed',
    verdict: mapVerdict(result.summary.verdict),
    routesVerified: result.summary.routesVerified,
    routesTotal: result.summary.routesTotal,
    findingsCount: result.findings.length,
    videoUrl: videoUpload?.videoUrl,
    videoThumbnailUrl: videoUpload?.thumbnailUrl,
    videoDuration: videoUpload?.duration,
    screenshots: videoUpload?.screenshots,
    findings: result.findings.map(f => ({
      type: f.ruleId,
      severity: f.severity,
      message: f.message,
      route: f.route.path,
    })),
    routeResults: result.receipts.map(r => ({
      route: r.subject.identifier,
      method: r.subject.method ?? 'GET',
      status: r.verdict === 'PASS' ? 'pass' : r.verdict === 'FAIL' ? 'fail' : 'skipped',
      error: r.failureDetail?.actual,
    })),
    startedAt: result.summary.startedAt,
    completedAt: result.summary.completedAt,
  };

  // Create the reality check record
  const record = await createRealityCheckRecord(apiUrl, authToken, payload);
  if (!record) {
    return null;
  }

  return {
    id: record.id,
    videoUrl: videoUpload?.videoUrl,
    thumbnailUrl: videoUpload?.thumbnailUrl,
    videoDuration: videoUpload?.duration,
    screenshots: videoUpload?.screenshots ?? [],
    dashboardUrl: webUrl ? `${webUrl}/reality-checks/${record.id}` : undefined,
  };
}

/**
 * Check if video upload is configured.
 */
export function isVideoUploadConfigured(): boolean {
  const provider = process.env.STORAGE_PROVIDER ?? 'local';
  if (provider === 'local') {
    return true; // Local storage always works
  }
  // For cloud storage, we need credentials
  return Boolean(
    process.env.STORAGE_ACCESS_KEY_ID &&
    process.env.STORAGE_SECRET_ACCESS_KEY
  );
}

/**
 * Check if API upload is configured.
 * Returns true if user is logged in or has env vars set.
 */
export async function isApiUploadConfigured(): Promise<boolean> {
  // Check env vars first (for CI/CD)
  if (process.env.VIBECHECK_AUTH_TOKEN) {
    return true;
  }
  
  // Check stored credentials
  return await isLoggedIn();
}
