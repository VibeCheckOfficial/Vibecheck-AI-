import * as vscode from 'vscode';

// ═══════════════════════════════════════════════════════════════════════════════
// AuthService - Clerk Integration for VS Code Extension
// ═══════════════════════════════════════════════════════════════════════════════

export interface UserTier {
  isPro: boolean;
  tier: 'free' | 'pro';
  userId?: string;
  email?: string;
  expiresAt?: string;
  scansRemaining?: number;
  scansLimit?: number;
}

export interface AuthStatus {
  isAuthenticated: boolean;
  user?: UserTier;
  error?: string;
}

const API_BASE_URL = 'https://vibecheckai.dev/api';
const API_KEY_SECRET_KEY = 'vibecheck-api-key';

export class AuthService {
  private static instance: AuthService;
  private context: vscode.ExtensionContext;
  private cachedStatus: AuthStatus | null = null;
  private statusListeners: ((status: AuthStatus) => void)[] = [];

  private constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  static getInstance(context?: vscode.ExtensionContext): AuthService {
    if (!AuthService.instance) {
      if (!context) {
        throw new Error('AuthService must be initialized with context first. Call getInstance(context) from extension.ts during activation.');
      }
      AuthService.instance = new AuthService(context);
    }
    // If instance exists, return it even if context is not provided
    return AuthService.instance;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // API Key Management (Secure Storage)
  // ─────────────────────────────────────────────────────────────────────────────

  async getApiKey(): Promise<string | undefined> {
    return await this.context.secrets.get(API_KEY_SECRET_KEY);
  }

  async setApiKey(apiKey: string): Promise<void> {
    await this.context.secrets.store(API_KEY_SECRET_KEY, apiKey);
    // Validate immediately after setting
    await this.validateAndCache();
  }

  async clearApiKey(): Promise<void> {
    await this.context.secrets.delete(API_KEY_SECRET_KEY);
    this.cachedStatus = {
      isAuthenticated: false,
      user: { isPro: false, tier: 'free' }
    };
    this.notifyListeners();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Authentication Flow
  // ─────────────────────────────────────────────────────────────────────────────

  async login(): Promise<AuthStatus> {
    const choice = await vscode.window.showQuickPick([
      {
        label: '$(key) Enter API Key',
        description: 'Paste your API key from vibecheckai.dev',
        action: 'enter'
      },
      {
        label: '$(link-external) Get API Key',
        description: 'Open vibecheckai.dev to get your API key',
        action: 'get'
      },
      {
        label: '$(sign-out) Logout',
        description: 'Remove stored API key',
        action: 'logout'
      }
    ], {
      placeHolder: 'VibeCheck Authentication',
      title: 'VibeCheck PRO'
    });

    if (!choice) {
      return this.cachedStatus || { isAuthenticated: false };
    }

    switch (choice.action) {
      case 'enter':
        return await this.promptForApiKey();

      case 'get':
        await vscode.env.openExternal(
          vscode.Uri.parse('https://vibecheckai.dev/dashboard/api-keys')
        );
        // After opening, prompt for the key
        const enterNow = await vscode.window.showInformationMessage(
          'Get your API key from the dashboard, then click "Enter Key" to continue.',
          'Enter Key',
          'Cancel'
        );
        if (enterNow === 'Enter Key') {
          return await this.promptForApiKey();
        }
        return this.cachedStatus || { isAuthenticated: false };

      case 'logout':
        await this.logout();
        return { isAuthenticated: false, user: { isPro: false, tier: 'free' } };

      default:
        return this.cachedStatus || { isAuthenticated: false };
    }
  }

  private async promptForApiKey(): Promise<AuthStatus> {
    const apiKey = await vscode.window.showInputBox({
      prompt: 'Enter your VibeCheck API Key',
      placeHolder: 'vk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (!value) {
          return 'API key is required';
        }
        // Accept both vk_ (new) and gr_ (legacy) prefixes
        const hasValidPrefix = value.startsWith('vk_') || value.startsWith('gr_');
        if (!hasValidPrefix || value.length < 20) {
          return 'Invalid API key format. Keys should start with "vk_" and be at least 20 characters';
        }
        return null;
      }
    });

    if (!apiKey) {
      return this.cachedStatus || { isAuthenticated: false };
    }

    // Show progress while validating
    return await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Validating API Key...',
      cancellable: false
    }, async () => {
      await this.setApiKey(apiKey);

      if (this.cachedStatus?.isAuthenticated) {
        void vscode.window.showInformationMessage(
          `✅ Logged in as ${this.cachedStatus.user?.email || 'PRO user'}. ${this.cachedStatus.user?.isPro ? 'PRO features unlocked!' : ''}`
        );
      } else {
        void vscode.window.showErrorMessage(
          `❌ Invalid API key. Get a valid key at vibecheckai.dev`
        );
        await this.clearApiKey();
      }

      return this.cachedStatus || { isAuthenticated: false };
    });
  }

  async logout(): Promise<void> {
    await this.clearApiKey();
    void vscode.window.showInformationMessage('Logged out of VibeCheck');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // API Key Validation (calls your backend)
  // ─────────────────────────────────────────────────────────────────────────────

  async validateApiKey(apiKey: string): Promise<AuthStatus> {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'X-Client': 'vscode-extension',
          'X-Client-Version': vscode.extensions.getExtension('vibecheck.vibecheck')?.packageJSON.version || '1.0.0'
        },
        body: JSON.stringify({ apiKey })
      });

      if (!response.ok) {
        if (response.status === 401) {
          return {
            isAuthenticated: false,
            error: 'Invalid API key'
          };
        }
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json() as {
        tier?: string;
        isPro?: boolean;
        userId?: string;
        email?: string;
        expiresAt?: string;
        scansRemaining?: number;
        scansLimit?: number;
      };

      return {
        isAuthenticated: true,
        user: {
          isPro: data.tier === 'pro' || data.isPro === true,
          tier: (data.tier as 'free' | 'pro') || (data.isPro ? 'pro' : 'free'),
          userId: data.userId,
          email: data.email,
          expiresAt: data.expiresAt,
          scansRemaining: data.scansRemaining,
          scansLimit: data.scansLimit
        }
      };
    } catch (error) {
      // If API is unreachable, check if we have a cached valid state
      // This allows offline usage for PRO users
      const cached = this.context.globalState.get<AuthStatus>('auth-cache');
      if (cached?.isAuthenticated && cached.user?.expiresAt) {
        const expiresAt = new Date(cached.user.expiresAt);
        if (expiresAt > new Date()) {
          return cached;
        }
      }

      return {
        isAuthenticated: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Status Checking
  // ─────────────────────────────────────────────────────────────────────────────

  async validateAndCache(): Promise<AuthStatus> {
    const apiKey = await this.getApiKey();

    if (!apiKey) {
      this.cachedStatus = {
        isAuthenticated: false,
        user: { isPro: false, tier: 'free' }
      };
      this.notifyListeners();
      return this.cachedStatus;
    }

    const status = await this.validateApiKey(apiKey);
    this.cachedStatus = status;

    // Cache for offline usage
    if (status.isAuthenticated) {
      await this.context.globalState.update('auth-cache', status);
    }

    this.notifyListeners();
    return status;
  }

  async getStatus(): Promise<AuthStatus> {
    if (this.cachedStatus) {
      return this.cachedStatus;
    }
    return await this.validateAndCache();
  }

  async isPro(): Promise<boolean> {
    const status = await this.getStatus();
    return status.isAuthenticated && (status.user?.isPro ?? false);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Event Listeners
  // ─────────────────────────────────────────────────────────────────────────────

  onStatusChange(listener: (status: AuthStatus) => void): vscode.Disposable {
    this.statusListeners.push(listener);
    return new vscode.Disposable(() => {
      const index = this.statusListeners.indexOf(listener);
      if (index >= 0) {
        this.statusListeners.splice(index, 1);
      }
    });
  }

  private notifyListeners(): void {
    const status = this.cachedStatus || { isAuthenticated: false };
    for (const listener of this.statusListeners) {
      try {
        listener(status);
      } catch (e) {
        // Ignore listener errors
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PRO Feature Gating
  // ─────────────────────────────────────────────────────────────────────────────

  async requirePro(featureName: string): Promise<boolean> {
    const isPro = await this.isPro();

    if (!isPro) {
      const choice = await vscode.window.showInformationMessage(
        `⚡ "${featureName}" requires VibeCheck PRO ($49/mo).\n\nUnlock auto-fix, shield enforcement, ship verdicts, and more.`,
        'Get PRO',
        'Enter API Key',
        'Cancel'
      );

      if (choice === 'Get PRO') {
        await vscode.env.openExternal(
          vscode.Uri.parse('https://vibecheckai.dev/pricing')
        );
      } else if (choice === 'Enter API Key') {
        const status = await this.promptForApiKey();
        return status.isAuthenticated && (status.user?.isPro ?? false);
      }

      return false;
    }

    return true;
  }
}
