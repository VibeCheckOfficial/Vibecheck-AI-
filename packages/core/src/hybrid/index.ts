/**
 * Hybrid Mode Service
 * 
 * Implements local-first analysis with optional cloud synchronization.
 * This is the primary mode for VibeCheck - run locally, sync to cloud.
 */

import { createHash } from 'crypto';
import { EventEmitter } from 'events';

export interface HybridConfig {
  /** API endpoint for cloud sync */
  apiUrl?: string;
  /** API key or JWT token */
  apiToken?: string;
  /** Project ID for cloud sync */
  projectId?: string;
  /** Enable automatic sync after scans */
  autoSync?: boolean;
  /** Sync interval in milliseconds (0 = manual only) */
  syncInterval?: number;
  /** Offline mode - never try to sync */
  offlineMode?: boolean;
}

export interface SyncResult {
  status: 'synced' | 'conflict' | 'offline' | 'error';
  localHash?: string;
  remoteHash?: string;
  timestamp: string;
  message?: string;
}

export interface TruthpackData {
  routes?: unknown[];
  env?: unknown[];
  auth?: unknown;
  contracts?: unknown[];
  meta?: {
    version: string;
    generatedAt: string;
    hash?: string;
  };
}

export class HybridModeService extends EventEmitter {
  private config: HybridConfig;
  private syncTimer: NodeJS.Timeout | null = null;
  private lastSyncTime: Date | null = null;
  private pendingChanges = false;

  constructor(config: HybridConfig = {}) {
    super();
    this.config = {
      autoSync: true,
      syncInterval: 0, // Manual sync by default
      offlineMode: false,
      ...config,
    };

    if (this.config.syncInterval && this.config.syncInterval > 0) {
      this.startSyncTimer();
    }
  }

  /**
   * Check if cloud sync is configured
   */
  isCloudEnabled(): boolean {
    return !!(this.config.apiUrl && this.config.apiToken && this.config.projectId);
  }

  /**
   * Check connection to cloud API
   */
  async checkConnection(): Promise<boolean> {
    if (this.config.offlineMode || !this.isCloudEnabled()) {
      return false;
    }

    try {
      const response = await fetch(`${this.config.apiUrl}/health`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiToken}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Sync local truthpack with cloud
   */
  async syncTruthpack(localTruthpack: TruthpackData): Promise<SyncResult> {
    if (this.config.offlineMode) {
      return {
        status: 'offline',
        timestamp: new Date().toISOString(),
        message: 'Offline mode enabled',
      };
    }

    if (!this.isCloudEnabled()) {
      return {
        status: 'offline',
        timestamp: new Date().toISOString(),
        message: 'Cloud sync not configured',
      };
    }

    try {
      // Calculate local hash
      const localHash = this.calculateHash(localTruthpack);

      // Check sync status with cloud
      const syncResponse = await fetch(
        `${this.config.apiUrl}/api/v1/truthpack/projects/${this.config.projectId}/sync`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            localHash,
            localTimestamp: localTruthpack.meta?.generatedAt ?? new Date().toISOString(),
          }),
        }
      );

      if (!syncResponse.ok) {
        throw new Error(`Sync failed: ${syncResponse.statusText}`);
      }

      const syncResult = await syncResponse.json() as {
        status: string;
        action?: string;
        localHash?: string;
        remoteHash?: string;
        truthpack?: TruthpackData;
      };

      switch (syncResult.status) {
        case 'in_sync':
          this.lastSyncTime = new Date();
          this.pendingChanges = false;
          return {
            status: 'synced',
            localHash,
            remoteHash: syncResult.remoteHash,
            timestamp: new Date().toISOString(),
            message: 'Truthpack is in sync',
          };

        case 'local_newer':
          // Upload local truthpack
          await this.uploadTruthpack(localTruthpack);
          this.lastSyncTime = new Date();
          this.pendingChanges = false;
          return {
            status: 'synced',
            localHash,
            timestamp: new Date().toISOString(),
            message: 'Uploaded local changes to cloud',
          };

        case 'remote_newer':
          // Remote is newer - emit event for caller to handle
          this.emit('remote-update', syncResult.truthpack);
          return {
            status: 'synced',
            localHash,
            remoteHash: syncResult.remoteHash,
            timestamp: new Date().toISOString(),
            message: 'Downloaded newer version from cloud',
          };

        case 'conflict':
          this.emit('conflict', {
            localHash,
            remoteHash: syncResult.remoteHash,
          });
          return {
            status: 'conflict',
            localHash,
            remoteHash: syncResult.remoteHash,
            timestamp: new Date().toISOString(),
            message: 'Conflict detected - manual resolution required',
          };

        default:
          return {
            status: 'error',
            timestamp: new Date().toISOString(),
            message: `Unknown sync status: ${syncResult.status}`,
          };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed';
      this.emit('error', error);
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        message,
      };
    }
  }

  /**
   * Upload truthpack to cloud
   */
  async uploadTruthpack(truthpack: TruthpackData): Promise<void> {
    if (!this.isCloudEnabled()) {
      throw new Error('Cloud sync not configured');
    }

    const response = await fetch(
      `${this.config.apiUrl}/api/v1/truthpack/projects/${this.config.projectId}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.config.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ truthpack }),
      }
    );

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }
  }

  /**
   * Download truthpack from cloud
   */
  async downloadTruthpack(): Promise<TruthpackData | null> {
    if (!this.isCloudEnabled()) {
      return null;
    }

    try {
      const response = await fetch(
        `${this.config.apiUrl}/api/v1/truthpack/projects/${this.config.projectId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.config.apiToken}`,
          },
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Download failed: ${response.statusText}`);
      }

      const data = await response.json() as { truthpack: TruthpackData };
      return data.truthpack;
    } catch (error) {
      this.emit('error', error);
      return null;
    }
  }

  /**
   * Upload scan results to cloud
   */
  async uploadScanResults(scanResults: {
    findings: unknown[];
    summary: unknown;
    truthpack?: TruthpackData;
    commitSha?: string;
    branch?: string;
  }): Promise<string | null> {
    if (!this.isCloudEnabled()) {
      return null;
    }

    try {
      const response = await fetch(
        `${this.config.apiUrl}/api/v1/scans`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            projectId: this.config.projectId,
            scanType: 'incremental',
            ...scanResults,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Upload scan failed: ${response.statusText}`);
      }

      const data = await response.json() as { scan: { id: string } };
      return data.scan.id;
    } catch (error) {
      this.emit('error', error);
      return null;
    }
  }

  /**
   * Mark that local changes are pending sync
   */
  markPendingChanges(): void {
    this.pendingChanges = true;
    this.emit('pending-changes');

    if (this.config.autoSync && this.isCloudEnabled()) {
      // Debounced auto-sync after changes
      // This would trigger the sync after a short delay
    }
  }

  /**
   * Calculate hash of truthpack for comparison
   */
  private calculateHash(truthpack: TruthpackData): string {
    const content = JSON.stringify({
      routes: truthpack.routes,
      env: truthpack.env,
      auth: truthpack.auth,
      contracts: truthpack.contracts,
    });
    return createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * Start periodic sync timer
   */
  private startSyncTimer(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    if (this.config.syncInterval && this.config.syncInterval > 0) {
      this.syncTimer = setInterval(() => {
        if (this.pendingChanges) {
          this.emit('sync-due');
        }
      }, this.config.syncInterval);
    }
  }

  /**
   * Stop sync timer and cleanup
   */
  dispose(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    this.removeAllListeners();
  }

  /**
   * Get sync status
   */
  getStatus(): {
    cloudEnabled: boolean;
    lastSyncTime: Date | null;
    pendingChanges: boolean;
    offlineMode: boolean;
  } {
    return {
      cloudEnabled: this.isCloudEnabled(),
      lastSyncTime: this.lastSyncTime,
      pendingChanges: this.pendingChanges,
      offlineMode: this.config.offlineMode ?? false,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<HybridConfig>): void {
    this.config = { ...this.config, ...config };
    
    if (config.syncInterval !== undefined) {
      this.startSyncTimer();
    }
  }
}

/**
 * Create a hybrid mode service with configuration from environment
 */
export function createHybridService(): HybridModeService {
  return new HybridModeService({
    apiUrl: process.env.VIBECHECK_API_URL,
    apiToken: process.env.VIBECHECK_API_TOKEN,
    projectId: process.env.VIBECHECK_PROJECT_ID,
    autoSync: process.env.VIBECHECK_AUTO_SYNC !== 'false',
    offlineMode: process.env.VIBECHECK_OFFLINE === 'true',
  });
}

export default HybridModeService;
