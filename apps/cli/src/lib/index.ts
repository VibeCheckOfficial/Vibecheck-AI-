/**
 * Library exports for CLI utilities
 * Central export point for all CLI infrastructure
 */

// Environment detection and capabilities
export {
  env,
  getEnvironment,
  refreshEnvironment,
  getSymbols,
  shouldAnimate,
  shouldPrompt,
  shouldUseColors,
  isVerbose,
  isQuiet,
  isProfilingEnabled,
  profileAsync,
  profileSync,
  createProfiler,
  getSafeTerminalWidth,
  wrapText,
  hyperlink,
  getCpuCount,
  getAvailableMemoryMB,
  hasEnoughMemory,
  onTerminalResize,
  registerShutdownHandlers,
  type Environment,
  type TerminalCapabilities,
} from './environment.js';

// Error handling with retry and timeout support
export {
  VibeCheckError,
  isVibeCheckError,
  wrapError,
  createErrorHandler,
  withRetry,
  withTimeout,
  assert,
  assertDefined,
  type ErrorCode,
  type ErrorSeverity,
  type ErrorContext,
} from './errors.js';

// Logging with multiple transports
export {
  createLogger,
  getLogger,
  setDefaultLogger,
  logger,
  createSpinnerLogger,
  type Logger,
  type LoggerOptions,
  type LogEntry,
  type LogLevel,
} from './logger.js';

// Configuration loading and validation
export {
  loadConfig,
  getConfigPath,
  clearConfigCache,
  validateConfig,
  mergeConfig,
  generateConfigTemplate,
  defineConfig,
  writeConfig,
  getConfigValue,
  setConfigValue,
  configSchema,
  defaultConfig,
  type VibeCheckConfig,
} from './config.js';

// Entitlement checking
export {
  setSession,
  getSession,
  getCurrentTier,
  getCurrentTierAsync,
  isAuthenticated,
  isAuthenticatedAsync,
  checkFeatureAccess,
  checkTierAccess,
  checkCommandAccess,
  COMMAND_TIER_REQUIREMENTS,
  OPTION_TIER_REQUIREMENTS,
  EXIT_CODES,
  type FeatureCheckResult,
} from './entitlements.js';

// Forge integration (internal - not a public command)
export {
  runForgeInternal,
  getForgeConfigForTier,
  formatForgeOutputForJson,
  shouldRunForgeAfterScan,
  printForgeUpgradeSuggestion,
  type ForgeIntegrationOptions,
  type ForgeIntegrationResult,
} from './forge-integration.js';

// CI/CD integration
export {
  detectCIPlatform,
  detectPackageManager,
  integrateWithCI,
  getIntegrationInstructions,
  type CIPlatform,
  type CIDetectionResult,
  type CIIntegrationResult,
  type CIIntegrationOptions,
} from './ci-integration.js';

// Reality check upload
export {
  uploadRealityCheckResults,
  uploadVideoArtifacts,
  isVideoUploadConfigured,
  isApiUploadConfigured,
  type RealityCheckUploadResult,
} from './reality-uploader.js';

// Credentials management
export {
  saveCredentials,
  loadCredentials,
  clearCredentials,
  hasCredentials,
  getAuthToken,
  getApiUrl,
  getWebUrl,
  getCurrentUser,
  isLoggedIn,
  loginWithApiKey,
  loginWithOAuthToken,
  getCredentialsPath,
  type StoredCredentials,
  type CredentialsResult,
} from './credentials.js';

// Version info (injected at build time)
export { CLI_VERSION, CLI_NAME } from './version.js';
