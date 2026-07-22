# Mailspring Performance Testing Harness

A reproducible UI performance tracing system for measuring rendering performance in Mailspring using Chrome DevTools Protocol (CDP) traces.

## Overview

This harness captures and analyzes performance metrics for scripted interactions in Mailspring, specifically:
- Layout time
- Paint time
- Style recalculation time
- Compositing time

The harness runs scenarios multiple times and reports median/p95 metrics to detect performance regressions.

## Architecture

```
benchmarks/
├── fixtures/
│   └── seed-account.ts       # Seeds local SQLite database with synthetic threads
├── scenarios/
│   └── archive-message.ts     # Archives a message while capturing CDP traces
├── lib/
│   ├── launch-electron.ts     # Playwright Electron launcher
│   ├── trace-capture.ts       # CDP session management
│   ├── trace-parse.ts         # Raw trace → metrics conversion
│   └── report.ts              # Results formatting & comparison
├── results/
│   └── *.json                 # Result files (git-sha-timestamp.json)
└── README.md                  # This file
```

## Prerequisites

- Node.js 16.17+
- npm 8+
- `xvfb` on headless Linux systems: `sudo apt-get install xvfb`
- Mailspring built and ready to run (`npm install` already done)

## Running the Harness

### Quick start: Run a single benchmark

```bash
cd benchmarks
npm run benchmark
```

This launches the archive-message scenario with default parameters (25 threads, 3 runs).

### With custom parameters

```bash
npm run benchmark -- --threads 100 --runs 5
```

### Headless mode (on rob-dev)

```bash
xvfb-run npm run benchmark
```

## Understanding Results

Results are saved to `benchmarks/results/<git-sha>-<timestamp>.json` and include:

- **Median**: 50th percentile of metric values across all runs
- **P95**: 95th percentile (worst 5% of runs)
- **Min/Max**: Minimum and maximum observed values
- **Mean**: Average value across runs

Key metrics:
- **Layout Duration**: Time spent in layout recalculations (ms)
- **Paint Duration**: Time spent painting pixels (ms)
- **Recalculate Style**: Time recalculating CSS (ms)
- **Composite Duration**: Time compositing layers (ms)
- **Total Main Thread Time**: Sum of above (ms)

### Interpreting Metrics

Lower is better for all metrics. The harness is designed to detect relative regressions, not absolute performance budgets. Use it to compare commits, not to judge if performance is "good."

### Example output

```
============================================================
Performance Benchmark Results
============================================================
Runs: 3 | Threads: 25 | Git SHA: a1b2c3d

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

## Comparing Results

### Find a previous result file

```bash
ls benchmarks/results/
# Output: a1b2c3d-2026-03-05T14-30-45-123Z.json
```

### Compare two commits

```bash
npm run benchmark -- --compare a1b2c3d b2c3d4e
```

This loads the two result files and shows a delta table with % changes.

### Example comparison output

```
Metric                    Baseline     Current      Delta        % Change
────────────────────────────────────────────────────────────────────────
Layout Duration           2.45         2.78         +0.33        +13.5% 🔴
Paint Duration            1.23         1.19         -0.04        -3.3%  ✓
```

## Seeding Strategy

The harness seeds Mailspring's local SQLite database (`edgehill.db`) with synthetic thread and message data before each run:

1. **No network dependency**: All data is local, eliminating network variance
2. **Parameterized**: Control thread count (5/25/100) to see how cost scales
3. **Fresh state**: Each run starts from an identical seeded state
4. **Reproducible**: Same thread/message IDs across runs

Seeded data includes:
- 1 fake "Benchmark Account" (generic provider, no IMAP credentials needed)
- Configurable number of threads in Inbox (default: 25)
- 2 messages per thread (configurable)
- Some threads marked as unread/starred for realism

## Limitations & Caveats

### What this harness CAN measure

- Relative performance differences (commit A vs B)
- Internal Blink rendering pipeline metrics (Layout, Paint, Composite)
- Performance on CPU-only systems (no GPU required)
- Consistent measurement across many runs

### What this harness CANNOT measure

- **Absolute frame times**: Xvfb + software rendering don't reflect real GPU compositing
- **Perceived smoothness**: Requires a human on real hardware
- **Real-world variance**: No network, no real sync engine, no user delays

**Verdict**: Use for commit-to-commit regression detection. **Final performance validation still happens on BorBook under real hardware.**

## Implementing New Scenarios

To add a new performance scenario:

1. Create a new scenario file: `benchmarks/scenarios/my-scenario.ts`
2. Implement the scenario logic (launch app, interact, capture traces)
3. Use the same seed/launch/trace/parse/report infrastructure
4. Example: `archive-message.ts` shows the pattern

Scenarios should:
- Use `seedAccount()` to set up initial state
- Use `launchElectron()` and Playwright APIs to interact
- Use `startTracing()` / `stopTracing()` around the interesting interaction
- Use `parseTrace()` to extract metrics
- Return aggregated results

## Development

### Build TypeScript

```bash
npm run tsc
```

### Run linting

```bash
npm run lint
```

### Debug a single run

Edit `archive-message.ts` and set `headless: false` in `launchElectron()` to see the UI while running.

## Troubleshooting

### "No thread items found in list"

The test selectors may have changed. Update the selectors in `archive-message.ts` by:
1. Running with `headless: false`
2. Inspecting the DOM in DevTools
3. Updating `[data-testid="thread-item"]` selector

### "Failed to start tracing"

Tracing may not be supported on your Electron/Playwright version. Check:
- Playwright version matches `package.json`
- Electron version is 41.7.2+

### "Mailspring couldn't find mailsync"

The mailsync process needs to be present. From the project root:
```bash
npm run build  # Includes mailsync download
```

## CI Integration (Future)

This harness is designed for local development on rob-dev. GitHub Actions CI integration is out of scope for this initial release but could be added later by:
1. Running `xvfb-run npm run benchmark` in CI
2. Comparing baseline.json vs current.json
3. Posting deltas as PR comments

## References

- Chrome DevTools Protocol: https://chromedevtools.github.io/devtools-protocol/
- Playwright: https://playwright.dev/
- Blink Rendering Pipeline: https://www.chromium.org/developers/design-documents/gpu-accelerated-compositing-in-chrome/
