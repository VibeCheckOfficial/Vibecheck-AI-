/**
 * UI exports - components, prompts, and theme
 */

// Theme and styling
export {
  // Symbols
  symbols,
  // Colors
  colors,
  // Gradients
  brandGradient,
  gradients,
  // Banner
  printBanner,
  // Formatting
  formatPath,
  formatCode,
  formatInlineCode,
  formatKeyValue,
  formatListItem,
  formatSuccess,
  formatError,
  formatWarning,
  formatInfo,
  formatStep,
  formatDuration,
  formatCount,
  formatBytes,
  formatPercent,
  // Layout
  divider,
  sectionHeader,
  box,
  progressBar,
  // Text utilities
  truncate,
  indent,
  stripAnsi,
  visibleLength,
  padEnd,
  center,
  tree,
  // Theme management
  refreshTheme,
} from './theme.js';

// Ink components
export {
  Banner,
  Spinner,
  Progress,
  Results,
  Table,
  type Task,
} from './components/index.js';

// Clack prompts
export {
  runInitWizard,
  confirmOverwrite,
  runConfigWizard,
  type InitWizardResult,
} from './prompts/index.js';

// Command header
export { renderCommandHeader, type CommandHeaderOptions } from './command-header.js';

// Unified result renderer (canonical output)
export {
  renderResult,
  renderHeader,
  renderPhases,
  renderSummary,
  renderFindings,
  renderFooter,
  renderJson,
  renderSuccess,
  renderError,
  renderWarning,
  VERDICT_COLORS,
  VERDICT_ICONS,
  SEVERITY_COLORS,
  SEVERITY_ICONS,
  type RenderOptions,
  type DisplayFinding,
} from './result-renderer.js';

// Gorgeous help system
export { renderHelp, renderCommandHelp } from './help.js';

// Interactive menu
export {
  showInteractiveMenu,
  showSubmenu,
  showConfirmation,
  showInput,
  showMultiSelect,
  showSpinner,
  showTaskList,
  printSuccess,
  printError,
  printWarning,
  printInfo,
} from './interactive-menu.js';

// Login component
export {
  showLoginScreen,
  showLogout,
  type UserSession,
} from './login.js';

// Upgrade prompts for Pro features
export {
  renderUpgradePrompt,
  printUpgradePrompt,
  printUpgradeHint,
  handleTierGate,
  printCloudSyncRequired,
  printEnterpriseReportsRequired,
  printCIGateRequired,
  printCustomRulesRequired,
  type UpgradePromptOptions,
  type GateHandlerOptions,
} from './upgrade-prompt.js';

// Unified Output System
export {
  formatOutput,
  formatJson,
  formatText,
  formatSarif,
  toScanOutput,
  toCategoryOutput,
  createQuickOutput,
  printOutput,
  printSuccess as printOutputSuccess,
  printError as printOutputError,
  printWarning as printOutputWarning,
  printTimingSummary,
  type ScanOutput,
} from './output.js';

// Unified Visualizations (gauges, bars, panels)
export {
  // Core gauges
  renderGauge,
  renderMiniGauge,
  renderScoreBar,
  // Category bars
  renderCategoryBar,
  renderCategoryBreakdown,
  // Verdict
  getVerdictConfig,
  renderVerdict,
  renderScoreWithVerdict,
  // Score panels
  renderScorePanel,
  renderSimpleScorePanel,
  // Severity
  renderSeverityCounts,
  renderSeverityIcon,
  // Progress
  renderProgress,
  getSpinnerFrame,
  // Timing
  renderTiming,
  renderTimingWithLabel,
  // Layout
  renderBox,
  renderDivider,
  renderSectionHeader,
  // Config constants
  GAUGE_CONFIG,
  BAR_CONFIG,
  VERDICT_CONFIG,
  SEVERITY_CONFIG,
} from './visualizations.js';
