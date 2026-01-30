/**
 * Credentials Manager
 * 
 * Persistent storage for CLI authentication credentials.
 * Stores tokens in the user's config directory (~/.config/vibecheck/).
 * 
 * @module lib/credentials
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';

// ============================================================================
// Types
// ============================================================================

/**
 * Stored credentials structure.
 */
export interface StoredCredentials {
  /** API auth token for cloud services */
  authToken?: string;
  /** API URL (defaults to production) */
  apiUrl?: string;
  /** Web dashboard URL */
  webUrl?: string;
  /** User ID */
  userId?: string;
  /** User email */
  email?: string;
  /** User display name */
  name?: string;
  /** User tier */
  tier?: 'free' | 'pro' | 'enterprise';
  /** Token expiration timestamp (ISO string) */
  expiresAt?: string;
  /** When credentials were last updated */
  updatedAt?: string;
}

/**
 * Result of loading credentials.
 */
export interface CredentialsResult {
  /** Whether credentials exist and are valid */
  valid: boolean;
  /** The credentials (if valid) */
  credentials?: StoredCredentials;
  /** Error message (if invalid) */
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

const CONFIG_DIR = path.join(os.homedir(), '.config', 'vibecheck');
const CREDENTIALS_FILE = 'credentials.json';
const CREDENTIALS_PATH = path.join(CONFIG_DIR, CREDENTIALS_FILE);

// Simple obfuscation key - not true security, just prevents casual reading
// For real security, use OS keychain (keytar) or encrypted storage
const OBFUSCATION_KEY = 'vibecheck-cli-v1';

// Default API URLs
const DEFAULT_API_URL = 'https://api.vibecheckai.dev';
const DEFAULT_WEB_URL = 'https://app.vibecheckai.dev';

// ============================================================================
// Obfuscation (not encryption - just prevents casual reading)
// ============================================================================

function obfuscate(data: string): string {
  const key = crypto.createHash('sha256').update(OBFUSCATION_KEY).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(data, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return iv.toString('base64') + ':' + encrypted;
}

function deobfuscate(data: string): string {
  try {
    const [ivBase64, encrypted] = data.split(':');
    if (!ivBase64 || !encrypted) return data; // Not obfuscated
    const key = crypto.createHash('sha256').update(OBFUSCATION_KEY).digest();
    const iv = Buffer.from(ivBase64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return data; // Return as-is if deobfuscation fails
  }
}

// ============================================================================
// Credentials Storage
// ============================================================================

/**
 * Ensure the config directory exists.
 */
async function ensureConfigDir(): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
}

/**
 * Save credentials to disk.
 */
export async function saveCredentials(credentials: StoredCredentials): Promise<void> {
  await ensureConfigDir();
  
  // Obfuscate sensitive fields
  const toSave = {
    ...credentials,
    authToken: credentials.authToken ? obfuscate(credentials.authToken) : undefined,
    updatedAt: new Date().toISOString(),
  };
  
  await fs.writeFile(
    CREDENTIALS_PATH,
    JSON.stringify(toSave, null, 2),
    { mode: 0o600 } // Owner read/write only
  );
}

/**
 * Load credentials from disk.
 */
export async function loadCredentials(): Promise<CredentialsResult> {
  try {
    const content = await fs.readFile(CREDENTIALS_PATH, 'utf-8');
    const stored = JSON.parse(content) as StoredCredentials;
    
    // Check if token is expired
    if (stored.expiresAt && new Date(stored.expiresAt) < new Date()) {
      return {
        valid: false,
        error: 'Token has expired. Please run `vibecheck login` to re-authenticate.',
      };
    }
    
    // Deobfuscate token
    const credentials: StoredCredentials = {
      ...stored,
      authToken: stored.authToken ? deobfuscate(stored.authToken) : undefined,
    };
    
    return {
      valid: Boolean(credentials.authToken),
      credentials,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        valid: false,
        error: 'Not logged in. Run `vibecheck login` to authenticate.',
      };
    }
    return {
      valid: false,
      error: `Failed to load credentials: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Delete stored credentials (logout).
 */
export async function clearCredentials(): Promise<void> {
  try {
    await fs.unlink(CREDENTIALS_PATH);
  } catch {
    // Ignore if file doesn't exist
  }
}

/**
 * Check if credentials exist.
 */
export async function hasCredentials(): Promise<boolean> {
  try {
    await fs.access(CREDENTIALS_PATH);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Token Helpers
// ============================================================================

/**
 * Get the auth token for API requests.
 * Checks environment variables first, then stored credentials.
 */
export async function getAuthToken(): Promise<string | undefined> {
  // Environment variable takes precedence (for CI/CD)
  if (process.env.VIBECHECK_AUTH_TOKEN) {
    return process.env.VIBECHECK_AUTH_TOKEN;
  }
  
  // Then check stored credentials
  const result = await loadCredentials();
  return result.credentials?.authToken;
}

/**
 * Get the API URL.
 * Checks environment variables first, then stored credentials, then defaults.
 */
export async function getApiUrl(): Promise<string> {
  // Environment variable takes precedence
  if (process.env.VIBECHECK_API_URL) {
    return process.env.VIBECHECK_API_URL;
  }
  if (process.env.API_URL) {
    return process.env.API_URL;
  }
  
  // Then check stored credentials
  const result = await loadCredentials();
  return result.credentials?.apiUrl ?? DEFAULT_API_URL;
}

/**
 * Get the Web dashboard URL.
 */
export async function getWebUrl(): Promise<string> {
  if (process.env.VIBECHECK_WEB_URL) {
    return process.env.VIBECHECK_WEB_URL;
  }
  if (process.env.WEB_URL) {
    return process.env.WEB_URL;
  }
  
  const result = await loadCredentials();
  return result.credentials?.webUrl ?? DEFAULT_WEB_URL;
}

/**
 * Get current user info from stored credentials.
 */
export async function getCurrentUser(): Promise<{
  userId?: string;
  email?: string;
  name?: string;
  tier?: 'free' | 'pro' | 'enterprise';
} | null> {
  const result = await loadCredentials();
  if (!result.valid || !result.credentials) {
    return null;
  }
  
  return {
    userId: result.credentials.userId,
    email: result.credentials.email,
    name: result.credentials.name,
    tier: result.credentials.tier,
  };
}

/**
 * Check if currently authenticated.
 */
export async function isLoggedIn(): Promise<boolean> {
  const token = await getAuthToken();
  return Boolean(token);
}

// ============================================================================
// Request Magic Link
// ============================================================================

/**
 * Request a magic link for passwordless login.
 * Sends an email with a login link.
 */
export async function requestMagicLink(
  email: string,
  options: { apiUrl?: string } = {}
): Promise<{ success: boolean; error?: string }> {
  const apiUrl = options.apiUrl ?? DEFAULT_API_URL;
  
  try {
    const response = await fetch(`${apiUrl}/api/v1/auth/magic-link/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });
    
    const data = await response.json() as {
      success: boolean;
      error?: { message: string };
    };
    
    if (!response.ok || !data.success) {
      return { 
        success: false, 
        error: data.error?.message ?? 'Failed to send magic link' 
      };
    }
    
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
      return { success: false, error: `Cannot connect to API at ${apiUrl}` };
    }
    return { success: false, error: message };
  }
}

/**
 * Verify a magic link token and login.
 */
export async function verifyMagicLink(
  token: string,
  options: { apiUrl?: string; webUrl?: string } = {}
): Promise<{ success: boolean; error?: string; user?: StoredCredentials }> {
  const apiUrl = options.apiUrl ?? DEFAULT_API_URL;
  const webUrl = options.webUrl ?? DEFAULT_WEB_URL;
  
  try {
    const response = await fetch(`${apiUrl}/api/v1/auth/magic-link/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });
    
    const data = await response.json() as {
      success: boolean;
      data?: {
        accessToken: string;
        expiresIn: number;
        user: {
          id: string;
          email: string;
          name?: string;
          tier: 'free' | 'pro' | 'enterprise';
        };
      };
      error?: { message: string };
    };
    
    if (!response.ok || !data.success) {
      return { 
        success: false, 
        error: data.error?.message ?? 'Invalid or expired magic link' 
      };
    }
    
    const { accessToken, expiresIn, user } = data.data!;
    
    // Store credentials
    const credentials: StoredCredentials = {
      authToken: accessToken,
      apiUrl,
      webUrl,
      userId: user.id,
      email: user.email,
      name: user.name,
      tier: user.tier,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
    
    await saveCredentials(credentials);
    
    return { success: true, user: credentials };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
      return { success: false, error: `Cannot connect to API at ${apiUrl}` };
    }
    return { success: false, error: message };
  }
}

// ============================================================================
// Login with Email/Password
// ============================================================================

/**
 * Login using email and password.
 * Authenticates with the API and stores the credentials.
 */
export async function loginWithEmailPassword(
  email: string,
  password: string,
  options: { apiUrl?: string; webUrl?: string } = {}
): Promise<{ success: boolean; error?: string; user?: StoredCredentials }> {
  const apiUrl = options.apiUrl ?? DEFAULT_API_URL;
  const webUrl = options.webUrl ?? DEFAULT_WEB_URL;
  
  try {
    const response = await fetch(`${apiUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });
    
    const data = await response.json() as {
      success: boolean;
      data?: {
        accessToken: string;
        expiresIn: number;
        user: {
          id: string;
          email: string;
          name?: string;
          tier: 'free' | 'pro' | 'enterprise';
        };
      };
      error?: {
        code: string;
        message: string;
      };
    };
    
    if (!response.ok || !data.success) {
      return { 
        success: false, 
        error: data.error?.message ?? 'Invalid email or password' 
      };
    }
    
    const { accessToken, expiresIn, user } = data.data!;
    
    // Store credentials
    const credentials: StoredCredentials = {
      authToken: accessToken,
      apiUrl,
      webUrl,
      userId: user.id,
      email: user.email,
      name: user.name,
      tier: user.tier,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
    
    await saveCredentials(credentials);
    
    return { success: true, user: credentials };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
      return { success: false, error: `Cannot connect to API at ${apiUrl}` };
    }
    return { success: false, error: message };
  }
}

// ============================================================================
// Login with API Key
// ============================================================================

/**
 * Login using an API key from the dashboard.
 * Validates the key with the API and stores the credentials.
 */
export async function loginWithApiKey(
  apiKey: string,
  options: { apiUrl?: string; webUrl?: string } = {}
): Promise<{ success: boolean; error?: string; user?: StoredCredentials }> {
  const apiUrl = options.apiUrl ?? DEFAULT_API_URL;
  const webUrl = options.webUrl ?? DEFAULT_WEB_URL;
  
  try {
    // Validate the API key with the server
    const response = await fetch(`${apiUrl}/api/v1/auth/me`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, error: 'Invalid API key. Please check and try again.' };
      }
      return { success: false, error: `Authentication failed: ${response.status}` };
    }
    
    const userData = await response.json() as {
      id: string;
      email: string;
      name?: string;
      tier: 'free' | 'pro' | 'enterprise';
    };
    
    // Store credentials
    const credentials: StoredCredentials = {
      authToken: apiKey,
      apiUrl,
      webUrl,
      userId: userData.id,
      email: userData.email,
      name: userData.name,
      tier: userData.tier,
      // API keys don't expire unless revoked
      expiresAt: undefined,
    };
    
    await saveCredentials(credentials);
    
    return { success: true, user: credentials };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
      return { success: false, error: `Cannot connect to API at ${apiUrl}` };
    }
    return { success: false, error: message };
  }
}

/**
 * Start OAuth flow by opening browser and waiting for callback.
 * Uses a local HTTP server to receive the OAuth callback.
 */
export async function loginWithOAuth(
  provider: 'github' | 'google',
  options: { apiUrl?: string; webUrl?: string } = {}
): Promise<{ success: boolean; error?: string; user?: StoredCredentials }> {
  const apiUrl = options.apiUrl ?? DEFAULT_API_URL;
  const webUrl = options.webUrl ?? DEFAULT_WEB_URL;
  
  // Dynamic imports for Node.js modules
  const http = await import('node:http');
  const { URL } = await import('node:url');
  
  return new Promise((resolve) => {
    // Create local server to receive callback
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost`);
      
      // Handle OAuth callback
      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');
        
        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1>❌ Authentication Failed</h1>
                <p>Error: ${error}</p>
                <p>You can close this window and try again.</p>
              </body>
            </html>
          `);
          server.close();
          resolve({ success: false, error: `OAuth error: ${error}` });
          return;
        }
        
        if (!code) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1>❌ Missing Authorization Code</h1>
                <p>You can close this window and try again.</p>
              </body>
            </html>
          `);
          server.close();
          resolve({ success: false, error: 'Missing authorization code' });
          return;
        }
        
        // Exchange code for tokens via the API
        try {
          const exchangeResponse = await fetch(`${apiUrl}/api/v1/auth/${provider}/exchange`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, redirect_uri: 'http://localhost:9876/callback' }),
          });
          
          const data = await exchangeResponse.json() as {
            success: boolean;
            data?: {
              accessToken: string;
              expiresIn: number;
              user: {
                id: string;
                email: string;
                name?: string;
                tier: 'free' | 'pro' | 'enterprise';
              };
            };
            error?: { message: string };
          };
          
          if (!exchangeResponse.ok || !data.success) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: system-ui; padding: 40px; text-align: center;">
                  <h1>❌ Authentication Failed</h1>
                  <p>${data.error?.message ?? 'Unknown error'}</p>
                  <p>You can close this window and try again.</p>
                </body>
              </html>
            `);
            server.close();
            resolve({ success: false, error: data.error?.message ?? 'Token exchange failed' });
            return;
          }
          
          const { accessToken, expiresIn, user } = data.data!;
          
          // Store credentials
          const credentials: StoredCredentials = {
            authToken: accessToken,
            apiUrl,
            webUrl,
            userId: user.id,
            email: user.email,
            name: user.name,
            tier: user.tier,
            expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
          };
          
          await saveCredentials(credentials);
          
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; min-height: 100vh; margin: 0;">
                <h1>✅ Authentication Successful!</h1>
                <p>Welcome, ${user.name ?? user.email}!</p>
                <p>You can close this window and return to the CLI.</p>
              </body>
            </html>
          `);
          server.close();
          resolve({ success: true, user: credentials });
        } catch (err) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1>❌ Authentication Failed</h1>
                <p>${err instanceof Error ? err.message : 'Unknown error'}</p>
                <p>You can close this window and try again.</p>
              </body>
            </html>
          `);
          server.close();
          resolve({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
        }
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    
    // Start server on random available port
    server.listen(9876, '127.0.0.1', async () => {
      const redirectUri = 'http://localhost:9876/callback';
      
      // Build OAuth URL
      let authUrl: string;
      if (provider === 'github') {
        const params = new URLSearchParams({
          client_id: process.env.GITHUB_CLIENT_ID ?? '',
          redirect_uri: `${apiUrl}/api/v1/auth/github/callback?cli_redirect=${encodeURIComponent(redirectUri)}`,
          scope: 'user:email read:user',
        });
        authUrl = `https://github.com/login/oauth/authorize?${params}`;
      } else {
        const params = new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID ?? '',
          redirect_uri: `${apiUrl}/api/v1/auth/google/callback?cli_redirect=${encodeURIComponent(redirectUri)}`,
          response_type: 'code',
          scope: 'openid email profile',
          access_type: 'offline',
          prompt: 'consent',
        });
        authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
      }
      
      // Open browser
      const open = (await import('open')).default;
      await open(authUrl);
    });
    
    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      resolve({ success: false, error: 'Authentication timed out. Please try again.' });
    }, 5 * 60 * 1000);
  });
}

/**
 * Login with OAuth token from web flow.
 */
export async function loginWithOAuthToken(
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  user: { id: string; email: string; name?: string; tier: 'free' | 'pro' | 'enterprise' },
  options: { apiUrl?: string; webUrl?: string } = {}
): Promise<void> {
  const credentials: StoredCredentials = {
    authToken: accessToken,
    apiUrl: options.apiUrl ?? DEFAULT_API_URL,
    webUrl: options.webUrl ?? DEFAULT_WEB_URL,
    userId: user.id,
    email: user.email,
    name: user.name,
    tier: user.tier,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
  
  await saveCredentials(credentials);
}

// ============================================================================
// Export Path for Advanced Users
// ============================================================================

/**
 * Get the credentials file path (for documentation/debugging).
 */
export function getCredentialsPath(): string {
  return CREDENTIALS_PATH;
}
