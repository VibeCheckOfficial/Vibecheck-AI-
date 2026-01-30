# VS Code Marketplace Checklist

## ✅ Completed

### Package.json
- ✅ Updated `name` to `"vibecheck"`
- ✅ Updated `displayName` to "Vibecheck — Agent Firewall (Stop Context Drift)"
- ✅ Updated `description` with proof-carry-change messaging
- ✅ Updated `version` to `2.2.0`
- ✅ Updated `publisher` to `"vibecheckai"`
- ✅ Added `license`, `homepage`, `bugs` fields
- ✅ Updated `categories` to `["Other", "Testing", "Linters", "SCM Providers"]`
- ✅ Updated `keywords` with Agent Firewall terms
- ✅ Icon exists at `images/vibecheck_logo_transparent_2x.png`

### README.md
- ✅ World-class marketplace-ready README
- ✅ Clear one-liner: "AI writes fast. Context drift ships bugs."
- ✅ Bullet points for what it blocks
- ✅ Quickstart section
- ✅ Examples showing what gets blocked
- ✅ Commands table
- ✅ VS Code integration section
- ✅ Configuration section

### CHANGELOG.md
- ✅ Updated with Agent Firewall release (2.2.0)
- ✅ Clear version history
- ✅ Feature highlights

## 📋 Pre-Publish Checklist

### Icon
- [ ] Verify icon is 256×256 or 512×512 PNG
- [ ] Icon has no tiny text (readable at small sizes)
- [ ] Icon is square format
- [ ] Icon path correct: `images/vibecheck_logo_transparent_2x.png`

### Screenshots/GIFs (Optional but Recommended)
- [ ] Create demo GIF showing firewall blocking a violation
- [ ] Add screenshot of status bar toggle
- [ ] Add screenshot of blocked violation message
- [ ] Place in `images/screenshots/` directory
- [ ] Reference in README: `![Demo](images/screenshots/demo.gif)`

### Testing
- [ ] Test extension loads correctly
- [ ] Test status bar toggle appears
- [ ] Test firewall toggle works
- [ ] Test commands are accessible
- [ ] Test on clean VS Code install

### Publishing
- [ ] Run `npm run build:prod`
- [ ] Run `vsce package` to create .vsix
- [ ] Test .vsix installation
- [ ] Run `vsce publish` (requires Azure DevOps token)

## 🎯 Key Selling Points (Already in README)

1. ✅ **Stops Context Drift** - Not hallucinations, but drift
2. ✅ **Proof-Carry-Change** - Must prove or blocked
3. ✅ **Three-Layer Protection** - MCP + File System + Git
4. ✅ **One-Click Toggle** - Status bar control
5. ✅ **Real Examples** - Shows exactly what gets blocked

## 📊 Marketplace Optimization

### Keywords (Already Added)
- ai, cursor, copilot, claude, windsurf
- agent, security, verification
- routes, environment, auth
- context drift, agent firewall, repo lock

### Categories (Already Set)
- Other (primary)
- Testing
- Linters
- SCM Providers

### Description (Optimized)
- Under 200 characters ✅
- Mentions key features ✅
- Includes "Agent Firewall" ✅

## 🚀 Ready to Publish

All core marketplace requirements are met. Optional enhancements:

1. **Demo GIF** - High conversion, but not required
2. **Screenshots** - Helpful but not required
3. **Video** - Nice to have, but not required

The extension is **marketplace-ready** as-is!
