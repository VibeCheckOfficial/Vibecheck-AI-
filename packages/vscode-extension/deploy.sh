#!/bin/bash

# Vibecheck VS Code Extension Deployment Script
# Usage: ./deploy.sh [publisher-id]

set -e

PUBLISHER=${1:-"vibecheck"}
VERSION=$(node -p "require('./package.json').version")

echo "🚀 Deploying Vibecheck Extension v$VERSION"
echo "Publisher: $PUBLISHER"

# Check if vsce is installed
if ! command -v vsce &> /dev/null; then
    echo "📦 Installing VSCE..."
    npm install -g @vscode/vsce
fi

# Build extension
echo "🔨 Building extension..."
npm run build

# Package extension
echo "📦 Packaging extension..."
vsce package

# Check if logged in
if ! vsce ls-publishers | grep -q "$PUBLISHER"; then
    echo "🔐 Please login to VS Code Marketplace:"
    echo "vsce login $PUBLISHER"
    echo "Then run this script again."
    exit 1
fi

# Publish extension
echo "🚀 Publishing to marketplace..."
vsce publish

echo "✅ Extension published successfully!"
echo "📊 View at: https://marketplace.visualstudio.com/items?itemName=${PUBLISHER}.vibecheck"
