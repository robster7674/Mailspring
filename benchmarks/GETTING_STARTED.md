# Getting Started with the Performance Harness

## Prerequisites

Before running the harness, ensure:

1. Node 16.17+ and npm 8+ are installed
2. Mailspring dependencies are installed: `npm install`
3. Mailspring has been built: `npm run build`
4. On headless Linux, install xvfb: `sudo apt-get install xvfb`

## Quick Start (< 2 minutes)

### 1. Verify setup works

```bash
npm run benchmark:compile
node benchmarks/dist/lib/test-launch.js
```

This should print:
```
✓ Electron app launched
✓ Main window available
```

If this fails, see [Troubleshooting](#troubleshooting) below.

### 2. Run a quick benchmark (5 threads, 2 runs)

```bash
# On desktop with display
npm run benchmark

# On headless Linux (rob-dev)
xvfb-run npm run benchmark
```

This will:
- Compile TypeScript benchmarks
- Run 2 iterations of the archive-message scenario with 5 threads
- Save results to `benchmarks/results/SHORT-SHA-timestamp.json`
- Print a summary table to stdout

### 3. Understand the output

```
Median
────────────────────────────────────────────────────────────
Layout Duration:          2.45ms
Paint Duration:           1.23ms
Recalculate Style:        0.56ms
Composite Duration:       0.34ms
Total Main Thread Time:   4.58ms
Frame Count:              8
Total Duration:           123.45ms
```

**Lower is better** for all metrics.

## Common Commands

```bash
# Run with 25 threads (production default)
npm run benchmark

# Run with 100 threads (stress test)
# Edit benchmarks/scenarios/archive-message.ts, change threadCount: 100

# Run with 10 iterations for better statistics
# Edit benchmarks/scenarios/archive-message.ts, change runs: 10

# Just compile without running
npm run benchmark:compile

# Check what results have been saved
ls benchmarks/results/

# Run with visual feedback (see the app)
# Edit benchmarks/lib/launch-electron.ts, uncomment headless: false
```

## Understanding the Metrics

### Layout Duration
Time spent calculating where elements go on the page. Called when you move/resize/animate elements.

**What causes it?** Any CSS change that affects element positions (transform animation bad, top animation very bad).

### Paint Duration
Time spent drawing pixels on screen. Called after layout for visible changes.

**What causes it?** Opacity changes, color changes, drawing operations. Usually smaller than layout.

### Composite Duration
Time spent combining layers. The GPU's job in ideal scenarios.

**What causes it?** Compositing layers that changed, even if layout/paint wasn't needed. Good animations use only composite.

### Total Main Thread Time
Sum of Layout + Paint + RecalculateStyle + Composite. Time the app couldn't respond to input.

**Goal:** Lower = app stays responsive while animating.

### Frame Count
How many animation frames were rendered. Expected: ~6-8 frames for a 120ms animation.

## What's Actually Being Measured

The harness captures **archive-message scenario**:
1. Opens the thread list
2. Clicks on a thread
3. Presses 'a' to archive
4. Captures rendering metrics while the thread animates out of view

This exercises:
- List virtualization (how many rows get re-rendered?)
- Animation performance (transform vs top?)
- Complex DOM updates

## Comparing Two Commits

The harness saves results with git SHA + timestamp:
```
benchmarks/results/a1b2c3d-2026-03-05T14-30-45-123Z.json
benchmarks/results/b2c3d4e-2026-03-05T14-35-20-456Z.json
```

To see if commit B is faster than commit A:

1. Check which result file is which:
   ```bash
   head -3 benchmarks/results/a1b2c3d-*.json  # Look at timestamp
   head -3 benchmarks/results/b2c3d4e-*.json
   ```

2. Compare manually by looking at both `median.layoutDuration` and `median.paintDuration` values

3. Or use a script (see [IMPLEMENTATION.md](./IMPLEMENTATION.md) for comparison code)

## Troubleshooting

### "Electron app launched failed"

**Problem:** `Error: spawn ENOENT`

**Solution:** Verify electron is available:
```bash
ls -la node_modules/.bin/electron
npm run build  # Downloads mailsync and electron
```

### "No thread items found"

**Problem:** `Error: No thread items found after wait`

**Solution:** 
1. The DOM selectors may have changed
2. The app may not be fully loaded
3. Database seeding may have failed

**Debug:**
```bash
# Edit benchmarks/lib/launch-electron.ts
# Uncomment headless config line and set to false
# This shows the app UI while running
npm run benchmark
```

Watch the app - does the thread list appear? Are there threads?

### "Thread list did not populate within timeout"

**Problem:** The thread list appears empty

**Solution:**
1. Check if database seeding worked:
   ```bash
   ls -l ~/.config/Mailspring-benchmark-*/edgehill.db
   ```

2. Check if the seeding script ran:
   ```bash
   npm run benchmark:compile
   node -e "
   const {seedAccount} = require('./benchmarks/dist/fixtures/seed-account.js');
   seedAccount({configDir: '/tmp/test-seed'}).catch(e => console.error(e));
   "
   ```

### "Failed to start tracing"

**Problem:** `Error: Tracing.start failed`

**Cause:** Playwright/Electron version incompatibility

**Solution:**
- Check Playwright version: `npm list playwright` (should be 1.59.1)
- Check Electron version: `npm list electron` (should be 41.7.2)

### Xvfb errors on rob-dev

**Problem:** `xvfb-run: error while loading shared libraries`

**Solution:**
```bash
sudo apt-get install xvfb libxrender1 libxrandr2
xvfb-run npm run benchmark
```

### Results file empty or corrupted

**Problem:** `benchmarks/results/*.json` has no data

**Solution:**
1. Delete the file: `rm benchmarks/results/*.json`
2. Re-run the benchmark
3. Check for crash logs: `npm run benchmark 2>&1 | tail -50`

## Expected Runtimes

| Config | Time | Runs |
|--------|------|------|
| 5 threads, 2 runs | ~30s | Quick smoke test |
| 25 threads, 3 runs | ~2min | Default (good stats) |
| 100 threads, 5 runs | ~5min | Stress test |

## What's Not Included (Future Work)

- [ ] Comparison command (`npm run benchmark:compare SHA1 SHA2`)
- [ ] CI integration (GitHub Actions)
- [ ] Baseline files checked into git
- [ ] Visual reports / graphs
- [ ] Multiple scenario types (besides archive)

These are out of scope for the initial release but can be added later.

## Next Steps

1. **Run your first benchmark**: `npm run benchmark`
2. **Make a code change** (e.g., switch `top` to `transform` animation in thread-list)
3. **Run again**: `npm run benchmark`
4. **Compare results** by looking at median values

You should see Layout/Paint times improve with the `transform` fix!

## Questions?

See [IMPLEMENTATION.md](./IMPLEMENTATION.md) for architecture details and debugging info.
