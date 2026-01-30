# vibecheck VS Code Extension

Production-ready VS Code extension for vibecheck - the AI code safety and production readiness tool.

## 🚀 Features

### Core Commands
- **Scan** (`Ctrl+Shift+G`) - Full workspace analysis
- **Ship** (`Ctrl+Shift+S`) - Quick ship readiness check  
- **Reality** (`Ctrl+Shift+R`) - Runtime UI testing
- **Prove** - Complete reality verification pipeline
- **Login** - Configure authentication securely

### UI Components
- **Status Bar** - Live score indicator (SHIP/WARN/BLOCK)
- **Sidebar Dashboard** - Interactive webview with results
- **Findings Tree** - Categorized issues with quick navigation
- **Problems Integration** - Findings appear in VS Code Problems panel
- **Auth Management** - Secure credential storage

### Integrations
- **Local CLI** - Works with vibecheck CLI installed locally
- **Auto-install** - Prompts to install CLI if missing
- **Real-time Updates** - UI updates as scans progress
- **File Navigation** - Click findings to jump to code

## 📦 Installation

### From VS Code Marketplace
1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "vibecheck AI"
4. Click Install

### Manual Installation
1. Download the `.vsix` file from [Releases](https://github.com/vibecheck-oss/vibecheck/releases)
2. In VS Code: `Extensions: Install from VSIX...`
3. Select the downloaded file

## 🎯 Quick Start

1. **Install the extension** from marketplace
2. **Open a project** folder in VS Code
3. **Run first scan**:
   - Press `Ctrl+Shift+G` (or `Cmd+Shift+G` on Mac)
   - Or click the shield icon in status bar
   - Or run `vibecheck: Scan` from Command Palette (`Ctrl+Shift+P`)
4. **Review results** in the sidebar panel
5. **Fix issues** shown in Problems panel

## 🔧 Setup

### CLI Installation
The extension will automatically prompt you to install the vibecheck CLI if it's not detected. You can also install it manually:

```bash
# Using npm
npm install -D @vibecheck/cli

# Using pnpm
pnpm add -D @vibecheck/cli

# Using yarn
yarn add -D @vibecheck/cli

# Global install
npm install -g @vibecheck/cli
```

### Authentication (Optional)
For Reality Mode and Prove features:

1. Open Command Palette (`Ctrl+Shift+P`)
2. Run `vibecheck: Login`
3. Configure:
   - **URL** - Your application URL (e.g., http://localhost:3000)
   - **Credentials** - Email/password for auth testing
   - **API Key** - For premium features (optional)

All credentials are stored securely using VS Code's SecretStorage API.

## 📊 Usage

### Running Scans
```bash
# From Command Palette
vibecheck: Scan          # Full workspace scan
vibecheck: Ship          # Ship readiness check
vibecheck: Reality       # Runtime testing
vibecheck: Prove         # Complete verification
```

### Understanding Results
- **🟢 SHIP (80-100)** - Ready to deploy
- **🟡 WARN (50-79)** - Fix warnings before production
- **🔴 BLOCK (0-49)** - Critical blockers must be fixed

### Findings Categories
- **🔴 Critical** - Security risks, hardcoded secrets, broken auth
- **🟡 Warnings** - Missing error handling, mock code in prod
- **💡 Info** - Debug code, style issues, optimizations

## 🔍 What It Catches

### Security Issues
- Hardcoded API keys, passwords, tokens
- Missing authentication on sensitive routes
- Insecure configurations
- Exposed sensitive data

### Code Quality
- Mock/test code in production paths
- Silent error catches
- Unhandled promise rejections
- Dead code and unused imports

### Runtime Issues
- Fake success UI (buttons that do nothing)
- Missing API endpoints
- Broken navigation
- Authentication gaps

## ⚙️ Configuration

```json
{
  "vibecheck.enabled": true,          // Enable/disable extension
  "vibecheck.analyzeOnSave": true,    // Scan on file save
  "vibecheck.analyzeOnType": false,   // Scan as you type
  "vibecheck.showInlineHints": true,  // Show inline decorations
  "vibecheck.severity": {             // Rule severity levels
    "CG001": "error",
    "CG002": "warning"
  },
  "vibecheck.ignorePaths": [          // Files to ignore
    "**/node_modules/**",
    "**/dist/**",
    "**/*.test.*"
  ]
}
```

## 🏗️ Architecture

### Local-First Design
- All analysis runs locally on your machine
- No code sent to external servers
- Works offline and in air-gapped environments
- Enterprise-friendly security model

### CLI Integration
- Extension wraps the vibecheck CLI
- Executes commands via child_process
- Parses JSON output for UI display
- Handles CLI installation and updates

### Secure Auth
- Uses VS Code SecretStorage API
- Credentials never logged or exposed
- Optional per-workspace configuration
- Clear and revoke options available

## 🐛 Troubleshooting

### CLI Not Found
```
Error: vibecheck CLI is not installed
```
**Solution**: Click the prompt to install, or run:
```bash
npm install -D @vibecheck/cli
```

### Scan Times Out
```
Error: Scan timeout after 5 minutes
```
**Solutions**:
- Check large folders in `.vibecheckignore`
- Exclude `node_modules`, `dist`, `build`
- Use `vibecheck: Ship` for faster checks

### Reality Mode Fails
```
Error: Could not connect to http://localhost:3000
```
**Solutions**:
- Ensure your app is running
- Check the URL in `vibecheck: Login`
- Verify auth credentials if required

### Findings Not Showing
1. Open the Problems panel (`Ctrl+Shift+M`)
2. Check "vibecheck" filter is enabled
3. Run `vibecheck: Scan` to refresh
4. Check Output > vibecheck for errors

## 📚 Advanced Usage

### CI/CD Integration
Add to your pipeline:
```yaml
# .github/workflows/vibecheck.yml
- name: vibecheck Check
  run: npx vibecheck ship --json
```

### Custom Rules
Create `.vibecheck/rules.json`:
```json
{
  "rules": {
    "no-console-log": {
      "pattern": "console\\.log",
      "message": "Remove console.log from production",
      "severity": "warning"
    }
  }
}
```

### API Integration
For advanced features:
```json
{
  "vibecheck.apiKey": "your-api-key",
  "vibecheck.endpoint": "https://api.vibecheckai.dev"
}
```

## 🔒 Privacy & Security

- ✅ **Local Analysis** - Core checks run entirely on your machine
- ✅ **No Telemetry** - We don't track your code or behavior
- ✅ **Opt-in Cloud** - Premium features require explicit API key
- ✅ **Secure Storage** - Auth uses VS Code's encrypted storage
- ✅ **Open Source** - [View the code](https://github.com/vibecheck-oss/vibecheck)

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

### Development Setup
```bash
git clone https://github.com/vibecheck-oss/vibecheck.git
cd vibecheck/vscode-extension
npm install
npm run compile
```

### Running Tests
```bash
npm test
npm run lint
```

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🆘 Support

- 📖 [Documentation](https://vibecheckai.dev/docs)
- 🐛 [Report Issues](https://github.com/vibecheck-oss/vibecheck/issues)
- 💬 [Discord Community](https://discord.gg/vibecheck)
- 📧 [Email Support](mailto:support@vibecheckai.dev)

## 🎉 Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

---

<p align="center">
  Made with ❤️ by the vibecheck team
</p>
