# Changelog

All notable changes to the Vibecheck VS Code extension will be documented in this file.

## 5.0.0 - Major Feature Release

### Added
- **Intent System** - Declare AI session intent with `vibecheck.setIntent`, `vibecheck.editIntent`, `vibecheck.showIntent`, `vibecheck.clearIntent`
- **Prompt Builder** - Interactive prompt builder panel with `vibecheck.promptBuilder` and `vibecheck.promptBuilderQuick`
- **File/Folder Locking** - Lock files and folders from AI agent modification
  - `vibecheck.lockFile`, `vibecheck.lockFolder`, `vibecheck.unlockFile`, `vibecheck.unlockFolder`
  - `vibecheck.toggleLock`, `vibecheck.showLockedFiles`, `vibecheck.unlockAll`
  - Visual decorations for locked files in explorer
- **Enhanced Shield Commands** - `vibecheck.shieldEnforce`, `vibecheck.shieldObserve`, `vibecheck.shieldOff`, `vibecheck.shieldInstall`
- **Verdict Panel** - New `vibecheck.showVerdict` command for ship/warn/block status
- **Explorer Context Menu** - Lock submenu for files and folders

### Changed
- Improved sidebar webview with better UI/UX
- Enhanced firewall service with intent tracking
- Better CLI integration with updated command structure

### Fixed
- Various stability improvements
- Better error handling throughout

---

## 2.2.2 - Dashboard Version Fix

### Fixed
- Dashboard now displays correct extension version dynamically from package.json
- Version display automatically stays in sync with package.json

---

## 2.2.1 - Agent Firewall Release

### Fixed
- Updated extension icon to use new logo
- Fixed extension name to avoid marketplace conflicts

---

## 2.2.0 - Agent Firewall Release

### Added
- **Agent Firewall** - Three-layer protection system
  - MCP Interceptor (blocks AI tool calls)
  - File System Hook (intercepts all file writes)
  - Git Pre-Commit Hook (validates commits)
- **Status Bar Toggle** - One-click enable/disable firewall hooks
- **Firewall Status Command** - Check firewall state and mode
- **Repo Lock Mode** - Enforce proof-carry-change policies
- **Truthpack Integration** - Real-time route/env/auth validation

### Changed
- Updated display name to "Vibecheck — Agent Firewall (Stop Context Drift)"
- Enhanced description to focus on context drift prevention
- Improved keywords for better marketplace discoverability

### Fixed
- File system hook daemon process management
- Git hook path resolution on Windows
- IDE extension activation timing

---

## 2.1.5

- Initial marketplace release
- Core scanning and diagnostics
- Score badge and dashboard
- AI code validation

---

## 2.1.0

- Premium features (Reality Mode, Compliance Dashboard)
- Team collaboration tools
- Performance monitoring
- MDC generator

---

## 2.0.0

- Major rewrite
- MCP client integration
- Enhanced diagnostics
- Export functionality

---

## 0.1.0

- Initial release
- Truthpack generation (routes/env/auth/contracts)
- Agent Firewall (observe + enforce)
- Repo Lock Mode policies
- Reports: Markdown + HTML
