# VS Code Extension Deployment Guide

## Prerequisites
- VS Code Marketplace publisher account (free)
- Node.js 18+
- Azure DevOps PAT (if using CI/CD)

## Step 1: Create Publisher Account
1. Go to [Visual Studio Marketplace](https://marketplace.visualstudio.com/manage)
2. Sign in with Microsoft/GitHub account
3. Create a publisher (e.g., "vibecheck")
4. Note your Publisher ID

## Step 2: Install VSCE
```bash
npm install -g @vscode/vsce
```

## Step 3: Update Package.json
Ensure these fields are correct:
```json
{
  "name": "vibecheck",
  "publisher": "your-publisher-id",
  "version": "2.0.0",
  "repository": {
    "type": "git",
    "url": "https://github.com/vibecheck-oss/vibecheck-Official"
  }
}
```

## Step 4: Create Marketplace Assets
Create these files in `vscode-extension/`:
- `images/icon.png` (128x128)
- `images/screenshots/` (5 screenshots, 1280x720)
- `README.md` (marketplace description)
- `CHANGELOG.md` (release notes)

## Step 5: Package Extension
```bash
cd vscode-extension
npm run build
vsce package
```

## Step 6: Publish to Marketplace
```bash
# Login (one-time)
vsce login your-publisher-id

# Publish
vsce publish
```

## Alternative: GitHub Actions CI/CD
Create `.github/workflows/publish.yml`:
```yaml
name: Publish Extension
on:
  push:
    tags:
      - 'v*'
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run build
      - uses: HaaLeo/publish-vscode-extension@v1
        with:
          pat: ${{ secrets.VSCE_PAT }}
```

## Step 7: Verify Publication
1. Go to your publisher page
2. Check extension appears
3. Test installation: `ext install vibecheck`

---

# MCP Server Deployment

## npm Registry
```bash
cd mcp-server
npm publish --access public
```

## GitHub Releases
1. Tag release: `git tag v2.0.0`
2. Push tag: `git push origin v2.0.0`
3. Create release on GitHub

---

# Web Dashboard Deployment

## Vercel (Recommended)
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
cd apps/web
vercel --prod
```

## Netlify Alternative
1. Connect GitHub repo to Netlify
2. Build command: `npm run build`
3. Publish directory: `dist`

## Railway/Docker
```bash
# Build image
docker build -t vibecheck-web .

# Run
docker run -p 3000:3000 vibecheck-web
```

---

# CLI Distribution

## npm Registry
```bash
cd packages/cli
npm publish --access public
```

## Homebrew (macOS)
Create `Formula/vibecheck.rb`:
```ruby
class vibecheck < Formula
  desc "AI code security scanner"
  homepage "https://vibecheckai.dev"
  url "https://registry.npmjs.org/vibecheck-cli-tool/-/vibecheck-cli-tool-2.4.13.tgz"
  sha256 "..."
  depends_on "node"

  def install
    system "npm", "install", *Language::Node.std_npm_install_args(libexec)
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end
end
```

## Chocolatey (Windows)
Create `chocolatey/vibecheck.nuspec` and publish to Chocolatey gallery.

## Scoop (Windows Cross-platform)
Add to scoop-extras bucket.

---

# Release Checklist

## Pre-Release
- [ ] All tests pass
- [ ] Version numbers updated
- [ ] CHANGELOG.md updated
- [ ] Documentation updated
- [ ] Assets prepared (icons, screenshots)

## Release Day
- [ ] Tag git repository
- [ ] Publish CLI to npm
- [ ] Publish MCP server to npm
- [ ] Publish VS Code extension
- [ ] Deploy web dashboard
- [ ] Create GitHub release
- [ ] Update website

## Post-Release
- [ ] Monitor downloads
- [ ] Check for issues
- [ ] Update documentation links
- [ ] Announce on social media
