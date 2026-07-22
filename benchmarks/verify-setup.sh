#!/bin/bash

# Verification script for Mailspring performance harness
# Run this to check if everything is set up correctly

set -e

echo "═══════════════════════════════════════════════════════"
echo "Mailspring Performance Harness - Setup Verification"
echo "═══════════════════════════════════════════════════════"

# Check dependencies
echo ""
echo "[1/5] Checking dependencies..."
if ! command -v node &> /dev/null; then
  echo "✗ Node.js not found"
  exit 1
fi
NODE_VERSION=$(node -v)
echo "✓ Node.js $NODE_VERSION"

if ! command -v npm &> /dev/null; then
  echo "✗ npm not found"
  exit 1
fi
NPM_VERSION=$(npm -v)
echo "✓ npm $NPM_VERSION"

# Check Playwright
echo ""
echo "[2/5] Checking Playwright..."
if [ ! -d "node_modules/@playwright" ]; then
  echo "✗ Playwright not installed"
  echo "  Run: npm install"
  exit 1
fi
echo "✓ Playwright installed"

# Check TypeScript
echo ""
echo "[3/5] Checking TypeScript..."
if [ ! -f "node_modules/.bin/tsc" ]; then
  echo "✗ TypeScript not installed"
  echo "  Run: npm install"
  exit 1
fi
echo "✓ TypeScript installed"

# Compile benchmarks
echo ""
echo "[4/5] Compiling benchmarks..."
if ! npm run benchmark:compile > /dev/null 2>&1; then
  echo "✗ Compilation failed"
  npm run benchmark:compile
  exit 1
fi
echo "✓ Benchmarks compiled successfully"

# Check Electron
echo ""
echo "[5/5] Checking Electron..."
if [ ! -f "node_modules/.bin/electron" ]; then
  echo "✗ Electron not installed"
  echo "  Run: npm run build"
  exit 1
fi
echo "✓ Electron installed"

# Summary
echo ""
echo "═══════════════════════════════════════════════════════"
echo "✓ All checks passed!"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo "  1. Quick test:  npm run benchmark"
echo "  2. Headless:    xvfb-run npm run benchmark"
echo "  3. Docs:        cat benchmarks/GETTING_STARTED.md"
echo ""
