/**
 * Compatibility Tests
 * 
 * Tests for extension compatibility with backend API server.
 * Ensures graceful degradation and upgrade notices work correctly.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { CompatibilityService } from '../../packages/vscode-extension/src/services/CompatibilityService';

// Mock vscode module
vi.mock('vscode', () => {
  const mockExtensionContext = {
    extension: {
      packageJSON: {
        version: '1.0.0',
      },
    },
    globalState: {
      get: vi.fn(),
      update: vi.fn(),
    },
  };

  return {
    window: {
      createOutputChannel: vi.fn(() => ({
        appendLine: vi.fn(),
        dispose: vi.fn(),
      })),
      showWarningMessage: vi.fn(),
      showInformationMessage: vi.fn(),
    },
    workspace: {
      getConfiguration: vi.fn(() => ({
        get: vi.fn(() => null),
        update: vi.fn(),
      })),
    },
    env: {
      openExternal: vi.fn(),
    },
    ConfigurationTarget: {
      Global: 1,
    },
  };
});

describe('CompatibilityService', () => {
  let service: CompatibilityService;
  let mockContext: vscode.ExtensionContext;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create mock context
    mockContext = {
      extension: {
        packageJSON: {
          version: '1.0.0',
        },
      },
      globalState: {
        get: vi.fn(),
        update: vi.fn(),
      },
    } as unknown as vscode.ExtensionContext;

    service = new CompatibilityService(mockContext);
  });

  describe('checkCompatibility', () => {
    it('should return compatible when API server is reachable and versions match', async () => {
      // Mock successful fetch
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            serverVersion: '1.0.0',
            minSupportedVersion: '0.9.0',
            compatible: true,
            warnings: [],
            deprecations: [],
            upgradeRequired: false,
            upgradeUrl: null,
          },
        }),
      });

      // Mock configuration
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn(() => 'https://api.vibecheck.dev'),
      } as unknown as vscode.WorkspaceConfiguration);

      const result = await service.checkCompatibility();

      expect(result.compatible).toBe(true);
      expect(result.upgradeRequired).toBe(false);
    });

    it('should return upgradeRequired when client version is too old', async () => {
      // Mock fetch with upgrade required
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            serverVersion: '2.0.0',
            minSupportedVersion: '1.5.0',
            compatible: false,
            warnings: [],
            deprecations: [],
            upgradeRequired: true,
            upgradeUrl: 'https://marketplace.visualstudio.com/items?itemName=vibecheck.vibecheck',
          },
        }),
      });

      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn(() => 'https://api.vibecheck.dev'),
      } as unknown as vscode.WorkspaceConfiguration);

      const result = await service.checkCompatibility();

      expect(result.compatible).toBe(false);
      expect(result.upgradeRequired).toBe(true);
      expect(result.upgradeUrl).toBe('https://marketplace.visualstudio.com/items?itemName=vibecheck.vibecheck');
    });

    it('should return compatible with warnings when minor version mismatch', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            serverVersion: '1.2.0',
            minSupportedVersion: '1.0.0',
            compatible: true,
            warnings: [{
              code: 'MINOR_VERSION_BEHIND',
              message: 'Client version is older than server. Some features may not be available.',
              affectedFeatures: ['new-features'],
              actionRequired: false,
            }],
            deprecations: [],
            upgradeRequired: false,
            upgradeUrl: null,
          },
        }),
      });

      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn(() => 'https://api.vibecheck.dev'),
      } as unknown as vscode.WorkspaceConfiguration);

      const result = await service.checkCompatibility();

      expect(result.compatible).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings?.[0]?.code).toBe('MINOR_VERSION_BEHIND');
    });

    it('should assume compatible on network error', async () => {
      // Mock network error
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn(() => 'https://api.vibecheck.dev'),
      } as unknown as vscode.WorkspaceConfiguration);

      const result = await service.checkCompatibility();

      // Should assume compatible on error (graceful degradation)
      expect(result.compatible).toBe(true);
      expect(result.warnings).toBeDefined();
    });

    it('should assume compatible on timeout', async () => {
      // Mock timeout
      global.fetch = vi.fn().mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), 100);
        });
      });

      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn(() => 'https://api.vibecheck.dev'),
      } as unknown as vscode.WorkspaceConfiguration);

      const result = await service.checkCompatibility();

      // Should assume compatible on timeout
      expect(result.compatible).toBe(true);
    });

    it('should assume compatible when no API URL configured', async () => {
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn(() => null), // No API URL
      } as unknown as vscode.WorkspaceConfiguration);

      const result = await service.checkCompatibility();

      // Should assume compatible (local-only mode)
      expect(result.compatible).toBe(true);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should cache result for subsequent calls', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            serverVersion: '1.0.0',
            minSupportedVersion: '0.9.0',
            compatible: true,
            warnings: [],
            deprecations: [],
            upgradeRequired: false,
            upgradeUrl: null,
          },
        }),
      });

      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn(() => 'https://api.vibecheck.dev'),
      } as unknown as vscode.WorkspaceConfiguration);

      // First call
      await service.checkCompatibility();
      // Second call
      await service.checkCompatibility();

      // Should only fetch once (cached)
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('showUpgradeNoticeIfNeeded', () => {
    it('should show upgrade notice when upgrade required', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            serverVersion: '2.0.0',
            minSupportedVersion: '1.5.0',
            compatible: false,
            warnings: [],
            deprecations: [],
            upgradeRequired: true,
            upgradeUrl: 'https://marketplace.visualstudio.com/items?itemName=vibecheck.vibecheck',
          },
        }),
      });

      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn(() => 'https://api.vibecheck.dev'),
      } as unknown as vscode.WorkspaceConfiguration);

      vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('Upgrade Now' as unknown as vscode.MessageItem);

      await service.showUpgradeNoticeIfNeeded();

      expect(vscode.window.showWarningMessage).toHaveBeenCalled();
    });

    it('should not show notice when compatible', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            serverVersion: '1.0.0',
            minSupportedVersion: '0.9.0',
            compatible: true,
            warnings: [],
            deprecations: [],
            upgradeRequired: false,
            upgradeUrl: null,
          },
        }),
      });

      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn(() => 'https://api.vibecheck.dev'),
      } as unknown as vscode.WorkspaceConfiguration);

      await service.showUpgradeNoticeIfNeeded();

      // Should not show warning when compatible
      expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    });
  });

  describe('enableFallbackMode', () => {
    it('should clear API server URL when enabling fallback mode', async () => {
      const mockConfig = {
        get: vi.fn(() => 'https://api.vibecheck.dev'),
        update: vi.fn(),
      };

      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockConfig as unknown as vscode.WorkspaceConfiguration);

      // Access private method via type assertion (for testing)
      const servicePrivate = service as unknown as { enableFallbackMode: () => Promise<void> };
      await servicePrivate.enableFallbackMode();

      expect(mockConfig.update).toHaveBeenCalledWith('apiServerUrl', '', vscode.ConfigurationTarget.Global);
    });
  });

  describe('clearCache', () => {
    it('should clear cached compatibility result', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            serverVersion: '1.0.0',
            minSupportedVersion: '0.9.0',
            compatible: true,
            warnings: [],
            deprecations: [],
            upgradeRequired: false,
            upgradeUrl: null,
          },
        }),
      });

      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn(() => 'https://api.vibecheck.dev'),
      } as unknown as vscode.WorkspaceConfiguration);

      // First call (caches result)
      await service.checkCompatibility();
      
      // Clear cache
      service.clearCache();
      
      // Second call (should fetch again)
      await service.checkCompatibility();

      // Should fetch twice (cache cleared)
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
