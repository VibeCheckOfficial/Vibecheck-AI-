/**
 * Video Storage Service
 * 
 * Handles uploading reality mode video recordings and screenshots to object storage.
 * Supports S3, Cloudflare R2, MinIO, and local filesystem storage.
 * 
 * @module storage/video-storage
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

// ============================================================================
// Types
// ============================================================================

/**
 * Supported storage providers.
 */
export type StorageProvider = 's3' | 'r2' | 'minio' | 'local';

/**
 * Storage configuration options.
 */
export interface StorageConfig {
  /** Storage provider type */
  provider: StorageProvider;
  /** S3-compatible bucket name */
  bucket: string;
  /** AWS region or 'auto' for R2 */
  region: string;
  /** Custom endpoint URL (required for R2/MinIO) */
  endpoint?: string;
  /** Access key ID */
  accessKeyId?: string;
  /** Secret access key */
  secretAccessKey?: string;
  /** Public URL prefix for serving files (CDN URL) */
  publicUrl?: string;
  /** Path prefix for all uploads */
  pathPrefix: string;
  /** Cloudflare account ID (for R2 auto-config) */
  cloudflareAccountId?: string;
}

/**
 * Upload result containing URLs and metadata.
 */
export interface UploadResult {
  /** Internal storage key */
  key: string;
  /** Public URL to access the file */
  url: string;
  /** Content type of the uploaded file */
  contentType: string;
  /** File size in bytes */
  size: number;
  /** ETag/checksum of the uploaded file */
  etag?: string;
}

/**
 * Options for uploading a file.
 */
export interface UploadOptions {
  /** Override the content type (auto-detected if not provided) */
  contentType?: string;
  /** Cache-Control header value */
  cacheControl?: string;
  /** Additional metadata to store with the file */
  metadata?: Record<string, string>;
  /** Make the file publicly accessible */
  public?: boolean;
}

/**
 * Video upload batch result.
 */
export interface VideoUploadResult {
  /** URL of the main video file */
  videoUrl: string;
  /** URL of the video thumbnail */
  thumbnailUrl?: string;
  /** Duration of the video in seconds */
  duration?: number;
  /** Array of screenshot URLs with timestamps */
  screenshots: Array<{
    url: string;
    timestamp: number;
    route?: string;
  }>;
}

// ============================================================================
// Content Type Detection
// ============================================================================

const CONTENT_TYPES: Record<string, string> = {
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.json': 'application/json',
  '.html': 'text/html',
  '.har': 'application/json',
};

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return CONTENT_TYPES[ext] || 'application/octet-stream';
}

// ============================================================================
// Storage Client Interface
// ============================================================================

interface StorageClient {
  upload(key: string, data: Buffer | string, options: UploadOptions): Promise<UploadResult>;
  getUrl(key: string): string;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

// ============================================================================
// S3-Compatible Storage Client
// ============================================================================

/**
 * S3-compatible storage client using native fetch API.
 * Works with AWS S3, Cloudflare R2, MinIO, and other S3-compatible services.
 */
class S3StorageClient implements StorageClient {
  private readonly config: StorageConfig;
  private readonly endpoint: string;

  constructor(config: StorageConfig) {
    this.config = config;
    
    // Build endpoint URL
    if (config.provider === 'r2' && config.cloudflareAccountId) {
      this.endpoint = `https://${config.cloudflareAccountId}.r2.cloudflarestorage.com`;
    } else if (config.endpoint) {
      this.endpoint = config.endpoint;
    } else {
      // Default AWS S3 endpoint
      this.endpoint = `https://s3.${config.region}.amazonaws.com`;
    }
  }

  async upload(key: string, data: Buffer | string, options: UploadOptions = {}): Promise<UploadResult> {
    const buffer = typeof data === 'string' ? Buffer.from(data) : data;
    const contentType = options.contentType || 'application/octet-stream';
    const fullKey = this.config.pathPrefix ? `${this.config.pathPrefix}/${key}` : key;
    
    const url = `${this.endpoint}/${this.config.bucket}/${fullKey}`;
    const date = new Date().toISOString().replace(/[:-]/g, '').replace(/\.\d{3}/, '');
    
    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Content-Length': buffer.length.toString(),
      'x-amz-date': date,
      'x-amz-content-sha256': crypto.createHash('sha256').update(buffer).digest('hex'),
    };

    if (options.cacheControl) {
      headers['Cache-Control'] = options.cacheControl;
    }

    if (options.public) {
      headers['x-amz-acl'] = 'public-read';
    }

    // Add metadata headers
    if (options.metadata) {
      for (const [k, v] of Object.entries(options.metadata)) {
        headers[`x-amz-meta-${k.toLowerCase()}`] = v;
      }
    }

    // Sign the request
    const signedHeaders = this.signRequest('PUT', fullKey, headers, buffer);

    const response = await fetch(url, {
      method: 'PUT',
      headers: signedHeaders,
      body: buffer,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`S3 upload failed: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    const etag = response.headers.get('etag')?.replace(/"/g, '');

    return {
      key: fullKey,
      url: this.getUrl(fullKey),
      contentType,
      size: buffer.length,
      etag,
    };
  }

  getUrl(key: string): string {
    if (this.config.publicUrl) {
      return `${this.config.publicUrl.replace(/\/$/, '')}/${key}`;
    }
    return `${this.endpoint}/${this.config.bucket}/${key}`;
  }

  async delete(key: string): Promise<void> {
    const fullKey = this.config.pathPrefix ? `${this.config.pathPrefix}/${key}` : key;
    const url = `${this.endpoint}/${this.config.bucket}/${fullKey}`;
    const date = new Date().toISOString().replace(/[:-]/g, '').replace(/\.\d{3}/, '');

    const headers = {
      'x-amz-date': date,
      'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
    };

    const signedHeaders = this.signRequest('DELETE', fullKey, headers);

    const response = await fetch(url, {
      method: 'DELETE',
      headers: signedHeaders,
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`S3 delete failed: ${response.status} ${response.statusText}`);
    }
  }

  async exists(key: string): Promise<boolean> {
    const fullKey = this.config.pathPrefix ? `${this.config.pathPrefix}/${key}` : key;
    const url = `${this.endpoint}/${this.config.bucket}/${fullKey}`;
    const date = new Date().toISOString().replace(/[:-]/g, '').replace(/\.\d{3}/, '');

    const headers = {
      'x-amz-date': date,
      'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
    };

    const signedHeaders = this.signRequest('HEAD', fullKey, headers);

    const response = await fetch(url, {
      method: 'HEAD',
      headers: signedHeaders,
    });

    return response.ok;
  }

  /**
   * Sign a request using AWS Signature Version 4.
   */
  private signRequest(
    method: string,
    key: string,
    headers: Record<string, string>,
    body?: Buffer
  ): Record<string, string> {
    if (!this.config.accessKeyId || !this.config.secretAccessKey) {
      // Return unsigned headers for local development
      return headers;
    }

    const date = headers['x-amz-date'];
    const dateStamp = date.substring(0, 8);
    const region = this.config.region === 'auto' ? 'auto' : this.config.region;
    const service = this.config.provider === 'r2' ? 's3' : 's3';
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    
    // Create canonical request
    const signedHeadersList = Object.keys(headers)
      .map(h => h.toLowerCase())
      .sort()
      .concat('host');
    
    const host = new URL(this.endpoint).host;
    const allHeaders = { ...headers, host };
    
    const canonicalHeaders = signedHeadersList
      .map(h => `${h}:${allHeaders[h] || allHeaders[h.split('-').map((p, i) => i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)).join('-')] || ''}`)
      .join('\n') + '\n';
    
    const payloadHash = headers['x-amz-content-sha256'];
    const canonicalUri = `/${this.config.bucket}/${key}`;
    const canonicalRequest = [
      method,
      canonicalUri,
      '', // query string
      canonicalHeaders,
      signedHeadersList.join(';'),
      payloadHash,
    ].join('\n');

    // Create string to sign
    const canonicalRequestHash = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      date,
      credentialScope,
      canonicalRequestHash,
    ].join('\n');

    // Calculate signature
    const kDate = crypto.createHmac('sha256', `AWS4${this.config.secretAccessKey}`).update(dateStamp).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
    const kService = crypto.createHmac('sha256', kRegion).update(service).digest();
    const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    // Build authorization header
    const authorization = `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeadersList.join(';')}, Signature=${signature}`;

    return {
      ...headers,
      Authorization: authorization,
      Host: host,
    };
  }
}

// ============================================================================
// Local Storage Client
// ============================================================================

/**
 * Local filesystem storage client for development.
 */
class LocalStorageClient implements StorageClient {
  private readonly config: StorageConfig;
  private readonly baseDir: string;

  constructor(config: StorageConfig, baseDir?: string) {
    this.config = config;
    this.baseDir = baseDir || path.join(process.cwd(), '.vibecheck', 'storage');
  }

  async upload(key: string, data: Buffer | string, options: UploadOptions = {}): Promise<UploadResult> {
    const buffer = typeof data === 'string' ? Buffer.from(data) : data;
    const contentType = options.contentType || 'application/octet-stream';
    const fullKey = this.config.pathPrefix ? `${this.config.pathPrefix}/${key}` : key;
    const filePath = path.join(this.baseDir, fullKey);

    // Ensure directory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    // Write file
    await fs.writeFile(filePath, buffer);

    // Write metadata file
    const metadataPath = `${filePath}.meta.json`;
    await fs.writeFile(metadataPath, JSON.stringify({
      contentType,
      size: buffer.length,
      metadata: options.metadata,
      uploadedAt: new Date().toISOString(),
    }));

    return {
      key: fullKey,
      url: this.getUrl(fullKey),
      contentType,
      size: buffer.length,
    };
  }

  getUrl(key: string): string {
    if (this.config.publicUrl) {
      return `${this.config.publicUrl.replace(/\/$/, '')}/${key}`;
    }
    // Return file:// URL for local storage
    return `file://${path.join(this.baseDir, key)}`;
  }

  async delete(key: string): Promise<void> {
    const fullKey = this.config.pathPrefix ? `${this.config.pathPrefix}/${key}` : key;
    const filePath = path.join(this.baseDir, fullKey);
    
    try {
      await fs.unlink(filePath);
      await fs.unlink(`${filePath}.meta.json`).catch(() => {});
    } catch {
      // Ignore if file doesn't exist
    }
  }

  async exists(key: string): Promise<boolean> {
    const fullKey = this.config.pathPrefix ? `${this.config.pathPrefix}/${key}` : key;
    const filePath = path.join(this.baseDir, fullKey);
    
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

// ============================================================================
// Video Storage Service
// ============================================================================

/**
 * High-level service for uploading reality mode videos and screenshots.
 */
export class VideoStorageService {
  private readonly client: StorageClient;
  private readonly config: StorageConfig;

  constructor(config: StorageConfig, localBaseDir?: string) {
    this.config = config;

    if (config.provider === 'local') {
      this.client = new LocalStorageClient(config, localBaseDir);
    } else {
      this.client = new S3StorageClient(config);
    }
  }

  /**
   * Upload a video file from a local path.
   */
  async uploadVideo(
    localPath: string,
    projectId: string,
    checkId: string,
    options: UploadOptions = {}
  ): Promise<UploadResult> {
    const buffer = await fs.readFile(localPath);
    const ext = path.extname(localPath);
    const key = `${projectId}/${checkId}/video${ext}`;
    const contentType = options.contentType || getContentType(localPath);

    return this.client.upload(key, buffer, {
      ...options,
      contentType,
      cacheControl: options.cacheControl || 'public, max-age=31536000',
      public: true,
    });
  }

  /**
   * Upload a video thumbnail.
   */
  async uploadThumbnail(
    localPath: string,
    projectId: string,
    checkId: string,
    options: UploadOptions = {}
  ): Promise<UploadResult> {
    const buffer = await fs.readFile(localPath);
    const ext = path.extname(localPath);
    const key = `${projectId}/${checkId}/thumbnail${ext}`;
    const contentType = options.contentType || getContentType(localPath);

    return this.client.upload(key, buffer, {
      ...options,
      contentType,
      cacheControl: options.cacheControl || 'public, max-age=31536000',
      public: true,
    });
  }

  /**
   * Upload a screenshot with timestamp metadata.
   */
  async uploadScreenshot(
    localPath: string,
    projectId: string,
    checkId: string,
    index: number,
    metadata: { timestamp?: number; route?: string } = {}
  ): Promise<UploadResult & { timestamp?: number; route?: string }> {
    const buffer = await fs.readFile(localPath);
    const ext = path.extname(localPath);
    const key = `${projectId}/${checkId}/screenshots/${index}${ext}`;
    const contentType = getContentType(localPath);

    const result = await this.client.upload(key, buffer, {
      contentType,
      cacheControl: 'public, max-age=31536000',
      public: true,
      metadata: {
        timestamp: String(metadata.timestamp ?? 0),
        route: metadata.route ?? '',
      },
    });

    return {
      ...result,
      timestamp: metadata.timestamp,
      route: metadata.route,
    };
  }

  /**
   * Upload all reality check artifacts from a directory.
   */
  async uploadRealityCheckArtifacts(
    artifactsDir: string,
    projectId: string,
    checkId: string
  ): Promise<VideoUploadResult> {
    const result: VideoUploadResult = {
      videoUrl: '',
      screenshots: [],
    };

    // Upload video if exists
    const videosDir = path.join(artifactsDir, 'videos');
    try {
      const videoFiles = await fs.readdir(videosDir);
      const videoFile = videoFiles.find(f => f.endsWith('.webm') || f.endsWith('.mp4'));
      if (videoFile) {
        const videoPath = path.join(videosDir, videoFile);
        const uploadResult = await this.uploadVideo(videoPath, projectId, checkId);
        result.videoUrl = uploadResult.url;

        // Try to get video duration from metadata or filename
        // Playwright stores videos with timestamp info
        result.duration = await this.getVideoDuration(videoPath);
      }
    } catch {
      // No videos directory
    }

    // Upload screenshots if exist
    const screenshotsDir = path.join(artifactsDir, 'screenshots');
    try {
      const screenshotFiles = await fs.readdir(screenshotsDir);
      const imageFiles = screenshotFiles.filter(f => 
        f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg')
      );

      let index = 0;
      for (const file of imageFiles.sort()) {
        const screenshotPath = path.join(screenshotsDir, file);
        
        // Try to extract timestamp from filename (e.g., "route-name-1234ms.png")
        const timestampMatch = file.match(/-(\d+)ms\./);
        const timestamp = timestampMatch ? parseInt(timestampMatch[1], 10) : index * 1000;
        
        // Try to extract route from filename
        const routeMatch = file.match(/^(.+?)-\d+ms\./);
        const route = routeMatch ? routeMatch[1].replace(/-/g, '/') : undefined;

        const uploadResult = await this.uploadScreenshot(
          screenshotPath,
          projectId,
          checkId,
          index,
          { timestamp, route }
        );

        result.screenshots.push({
          url: uploadResult.url,
          timestamp,
          route,
        });

        index++;
      }
    } catch {
      // No screenshots directory
    }

    // Generate thumbnail from first screenshot if no video
    if (!result.thumbnailUrl && result.screenshots.length > 0) {
      result.thumbnailUrl = result.screenshots[0].url;
    }

    return result;
  }

  /**
   * Get video duration in seconds.
   * This is a simplified version - for accurate duration, use ffprobe.
   */
  private async getVideoDuration(videoPath: string): Promise<number | undefined> {
    try {
      const stats = await fs.stat(videoPath);
      // Rough estimate based on file size (webm ~500KB per second at 720p)
      const estimatedSeconds = Math.round(stats.size / 500000);
      return estimatedSeconds > 0 ? estimatedSeconds : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Delete all artifacts for a reality check.
   */
  async deleteRealityCheckArtifacts(projectId: string, checkId: string): Promise<void> {
    const prefix = `${projectId}/${checkId}/`;
    // For simplicity, we'll just try to delete known files
    // A full implementation would list and delete all objects with the prefix
    const filesToDelete = [
      `${prefix}video.webm`,
      `${prefix}video.mp4`,
      `${prefix}thumbnail.png`,
      `${prefix}thumbnail.jpg`,
    ];

    for (const key of filesToDelete) {
      await this.client.delete(key).catch(() => {});
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a VideoStorageService from environment variables.
 */
export function createVideoStorageService(env?: Record<string, string | undefined>): VideoStorageService {
  const getEnv = (key: string, defaultValue?: string): string | undefined => {
    return env?.[key] ?? process.env[key] ?? defaultValue;
  };

  const config: StorageConfig = {
    provider: (getEnv('STORAGE_PROVIDER', 'local') as StorageProvider),
    bucket: getEnv('STORAGE_BUCKET', 'vibecheck-artifacts') ?? 'vibecheck-artifacts',
    region: getEnv('STORAGE_REGION', 'auto') ?? 'auto',
    endpoint: getEnv('STORAGE_ENDPOINT'),
    accessKeyId: getEnv('STORAGE_ACCESS_KEY_ID'),
    secretAccessKey: getEnv('STORAGE_SECRET_ACCESS_KEY'),
    publicUrl: getEnv('STORAGE_PUBLIC_URL'),
    pathPrefix: getEnv('STORAGE_PATH_PREFIX', 'reality-checks') ?? 'reality-checks',
    cloudflareAccountId: getEnv('CLOUDFLARE_ACCOUNT_ID'),
  };

  return new VideoStorageService(config);
}
