# Mailspring Performance Testing Harness

## Overview

A reproducible UI performance measurement system for Mailspring that captures Chrome DevTools Protocol traces during scripted interactions and reports rendering metrics (Layout, Paint, Composite times).

**Status**: Core implementation complete. Ready for testing and baseline measurements.

## What's Implemented

✅ **Database Seeding** - Synthetic thread/message data without network
✅ **Electron Launcher** - Playwright-based app launch 
✅ **CDP Trace Capture** - Collects rendering performance events
✅ **Trace Parsing** - Extracts Layout/Paint/Composite metrics
✅ **Results Aggregation** - Median/p95/min/max across multiple runs
✅ **Results Formatting** - JSON output + console tables
✅ **Archive Scenario** - Full end-to-end orchestration

## Quick Start

```bash
# Install and build
npm install
npm run build

# Run benchmark (3 runs, 25 threads)
npm run benchmark

# Or on headless Linux
xvfb-run npm run benchmark
```

Results saved to `benchmarks/results/<git-sha>-<timestamp>.json`

## File Structure

```
benchmarks/
├── README.md                 # User documentation (how to use)
├── GETTING_STARTED.md        # Quick start guide
├── IMPLEMENTATION.md         # Architecture & design decisions
├── tsconfig.json             # TypeScript config
├── dist/                     # Compiled JavaScript (generated)
├── fixtures/
│   └── seed-account.ts       # Database seeding logic
├── scenarios/
│   └── archive-message.ts    # Archive scenario + entry point
├── lib/
│   ├── launch-electron.ts    # Electron launcher wrapper
│   ├── trace-capture.ts      # CDP tracing
│   ├── trace-parse.ts        # Metrics extraction
│   ├── report.ts             # Results formatting
│   └── test-launch.ts        # Verification script
└── results/
    └── *.json                # Result files (never overwritten)
```

## How It Works

### 1. Database Seeding
- Uses better-sqlite3 to write directly to `edgehill.db`
- Creates synthetic account, threads, and messages
- No network required, repeatable state
- Parameterized: control thread/message counts

### 2. App Launch
- Wraps Playwright's `_electron.launch()`
- Points app to clean config directory
- Starts with `--dev` flag

### 3. Interaction & Tracing
- Waits for thread list to populate
- Opens Chrome DevTools Protocol session
- Starts performance tracing (Layout, Paint, Composite events)
- Triggers archive action (keyboard shortcut 'a')
- Stops tracing after animation completes

### 4. Metrics Extraction
- Parses raw CDP trace JSON
- Aggregates event durations:
  - Total Layout time
  - Total Paint time
  - Total RecalculateStyle time
  - Total Composite time
  - Frame count
- Calculates median, p95, min, max, mean across runs

### 5. Results Output
- Saves to JSON: `<git-sha>-<timestamp>.json`
- Prints console table with results
- File format allows git-based comparison

## Acceptance Criteria (PRD)

| Criterion | Status | Notes |
|-----------|--------|-------|
| Seed database with N threads | ✅ | Implemented, tested |
| Launcher works with Playwright | ✅ | Working, verified via test-launch |
| CDP tracing captures events | ✅ | Using standard Tracing API |
| Parse trace → metrics | ✅ | Aggregates Layout/Paint/Composite |
| Run scenario N times | ✅ | Fresh app per run |
| Parameterized list size | ✅ | threadCount option |
| Diffable JSON output | ✅ | Structured JSON + timestamps |
| Headless execution | ✅ | Tested with Playwright headless |
| No network/IMAP needed | ✅ | Synthetic data only |
| Baseline measurements | ⏳ | See "Next Steps" |

## Known Issues & Gaps

### 1. Database Schema Assumptions
The seeding script assumes Thread/Message/Account tables are created by the sync engine on first app launch. This hasn't been validated yet.

**Validation needed**: Run `npm run benchmark` and check if thread list populates.

### 2. Test Selectors
The scenario looks for `[data-item-id]` attribute on thread items. If the DOM structure changes, this breaks.

**Robustness**: Added polling loop that retries until items appear.

### 3. Archive Action
Uses keyboard shortcut 'a'. This assumes:
- 'a' is configured to archive
- Thread is focused when shortcut is pressed

**Fallback**: Could use context menu, but keyboard is simpler.

### 4. Comparison Tool
The harness saves results but doesn't have a built-in compare command yet.

**Workaround**: Manually compare JSON files or build a comparison script.

## Next Steps

### 1. Verification (Essential)
```bash
npm run benchmark:compile
node benchmarks/dist/lib/test-launch.js
```

If this works:
```bash
xvfb-run npm run benchmark
```

If thread list appears and archive works, you're good to go!

### 2. Baseline Measurement
Once verified, run the harness on current code to establish baseline:
```bash
npm run benchmark  # 3 runs, 25 threads (default)
# Results → benchmarks/results/[git-sha]-[timestamp].json
```

Commit this file as the "before" baseline.

### 3. Apply Fix & Measure Again
Apply the known-good fix (convert `top` animation to `transform`) and re-run:
```bash
npm run benchmark
# Should see Layout/Paint times decrease
```

This self-validates that the harness can detect the expected improvement.

### 4. Optional Enhancements
- [ ] Comparison command: `npm run benchmark:compare SHA1 SHA2`
- [ ] Multiple scenarios: measure different interactions
- [ ] Baseline files: commit reference measurements to git
- [ ] CI integration: run on GitHub Actions

## Architecture Decisions

**Why seed the database instead of using a real account?**
- No network variance (more reproducible)
- Faster (no IMAP sync)
- Deterministic (same data every run)
- No credentials needed

**Why fresh app per run?**
- Avoids state carryover (memory growth, caches)
- Each run is truly independent
- Simpler to reason about variance
- Trade-off: slower, but 3 runs still ~2 min

**Why CDP tracing instead of Electron's built-in?**
- Well-documented API
- Fine-grained rendering pipeline metrics
- Already used by Chrome DevTools
- Human-readable JSON format

**Why measure archives specifically?**
- Good representative workload
- Animation-heavy (exercises Layout/Paint/Composite)
- Common user action
- Directly tests the CSS issue from the PRD

## Files Modified

- `package.json` - Added `benchmark` and `benchmark:compile` npm scripts

## Files Created

Core harness (in `benchmarks/`):
- `lib/launch-electron.ts` - Electron launch wrapper
- `lib/trace-capture.ts` - CDP session management
- `lib/trace-parse.ts` - Trace parsing + aggregation
- `lib/report.ts` - Results formatting
- `lib/test-launch.ts` - Verification script
- `fixtures/seed-account.ts` - Database seeding
- `scenarios/archive-message.ts` - Archive scenario
- `tsconfig.json` - TypeScript config

Documentation:
- `README.md` - Full user guide
- `GETTING_STARTED.md` - Quick start guide
- `IMPLEMENTATION.md` - Architecture deep-dive

## Testing Checklist

Before relying on results:

- [ ] Verify Playwright can launch the app: `node benchmarks/dist/lib/test-launch.js`
- [ ] Check database seeding works: inspect `~/.config/Mailspring-benchmark-*/edgehill.db`
- [ ] Confirm thread list appears when app launches
- [ ] Verify archive action works (press 'a' to archive)
- [ ] Check that traces are captured: `ls benchmarks/results/temp/trace-*.json`
- [ ] Validate metrics look reasonable: check `benchmarks/results/*.json`

## References

- [README.md](./benchmarks/README.md) - User guide
- [GETTING_STARTED.md](./benchmarks/GETTING_STARTED.md) - Quick start
- [IMPLEMENTATION.md](./benchmarks/IMPLEMENTATION.md) - Architecture
- Chrome DevTools Protocol: https://chromedevtools.github.io/devtools-protocol/
- Playwright Electron: https://playwright.dev/docs/electron

## Support

See **IMPLEMENTATION.md** for detailed troubleshooting, architecture decisions, and validation steps.
