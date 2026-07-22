# Performance Testing Harness - Implementation Notes

## What's Been Built

This is a reproducible UI performance tracing harness for Mailspring, implementing the PRD requirements:

### Core Components

1. **Seed Script** (`fixtures/seed-account.ts`)
   - Seeds Mailspring-dev's local SQLite database (`edgehill.db`)
   - Creates synthetic test data: 1 fake account, N threads, M messages per thread
   - No network dependency, repeatable state
   - Uses better-sqlite3 to write directly to the database

2. **Electron Launcher** (`lib/launch-electron.ts`)
   - Wraps Playwright's `_electron.launch()`
   - Configures app to use Mailspring-benchmark config directory
   - Starts with `--dev` flag for development environment

3. **Trace Capture** (`lib/trace-capture.ts`)
   - Opens Chrome DevTools Protocol (CDP) session
   - Captures performance events: Layout, Paint, RecalculateStyle, Composite
   - Saves raw trace to JSON file

4. **Trace Parser** (`lib/trace-parse.ts`)
   - Parses CDP trace JSON
   - Extracts aggregate metrics:
     - Total Layout time
     - Total Paint time
     - Total RecalculateStyle time
     - Total Composite time
     - Frame count
     - Interaction duration
   - Aggregates across multiple runs (median, p95, min, max, mean)

5. **Reporter** (`lib/report.ts`)
   - Formats results as readable tables
   - Compares two result files showing delta and % change
   - Saves results to JSON with git SHA and timestamp

6. **Archive Message Scenario** (`scenarios/archive-message.ts`)
   - Orchestrates the full benchmark:
     1. Seeds database with threads
     2. Launches Electron app
     3. Waits for thread list to populate
     4. Starts CDP tracing
     5. Archives a message (triggers animation)
     6. Stops tracing
     7. Parses metrics
   - Repeats N times (default 3) with fresh state each run
   - Aggregates and reports results

## How to Run

### First Build (if not done)

```bash
npm install
npm run build
```

### Run the Benchmark

```bash
# Single run
npm run benchmark

# With xvfb on headless robdev
xvfb-run npm run benchmark

# Compile only (for testing)
npm run benchmark:compile
```

## Known Issues & Open Questions

### 1. Database Schema
**Status**: Partially resolved

The script inserts data into a raw JSON `data` column for each model table (Thread, Message, Account, Folder). This matches how Mailspring queries the database (from query.ts).

**Open question**: Do the Thread and Message tables exist yet when the app first launches, or are they created by the sync engine? Currently assuming the sync engine creates the schema on first app launch.

**Solution needed**: If tables don't exist on first launch, we need to either:
- Let the app initialize first (which might require a network or sync setup)
- Pre-create the schema manually
- Check if there's an initialization API we can call

### 2. Playwright/Electron Compatibility
**Status**: Assumed working, needs verification

- Playwright version: 1.59.1 (from package.json)
- Electron version: 41.7.2
- Playwright's `_electron.launch()` requires a specific API

**Verification needed**: Test run of `benchmarks/lib/test-launch.ts` to confirm:
```bash
npx tsc -p benchmarks/tsconfig.json
node benchmarks/lib/test-launch.js
```

### 3. CDP Session & Tracing API
**Status**: Implemented, needs verification

The trace capture uses `Tracing.start` and `Tracing.end` commands via CDP. The exact API might differ between Playwright versions.

**Fallback**: If CDP tracing doesn't work, we could use Electron's built-in --trace-to-file flag.

### 4. Test Selectors
**Status**: Working fallback in place

The scenario looks for thread items using `[data-item-id]` selector (from thread-list.tsx line 205). If the DOM structure changes, this will break.

**Robustness**: Added polling loop (`waitForThreadListPopulated`) that retries until items appear.

### 5. Archive Action
**Status**: Uses keyboard shortcut as primary trigger

The current implementation presses 'a' for archive. This assumes:
- 'a' is bound to archive (check keymaps)
- The thread is focused/selected
- Archive is a valid action in the current view

**Alternative**: Could right-click and select from context menu, but keyboard is simpler.

## Testing Checklist

Before running the full benchmark:

1. **Verify Playwright launch**
   ```bash
   npm run benchmark:compile
   node benchmarks/lib/test-launch.js
   ```
   - Should print: "✓ Electron app launched", "✓ Main window available"

2. **Verify database seeding**
   ```bash
   # Create temp dir and seed it
   node -e "
   const {seedAccount} = require('./benchmarks/lib/seed-account.js');
   seedAccount({configDir: '/tmp/mailspring-seed-test'}).then(() => console.log('✓ Seeding worked'));
   "
   ```

3. **Verify schema assumptions**
   - Check if `edgehill.db` has Thread/Message/Account tables
   - Inspect the actual schema once the app launches once

4. **Run with debug output**
   ```bash
   # Modify scenario to set headless: false in launchElectron call
   # This shows the UI while running
   npm run benchmark
   ```

## Architecture Decisions

### Why seed the database directly?
- No network dependency (more reproducible)
- Faster (no IMAP sync needed)
- Deterministic (same data every run)
- Avoids credentials complexity

### Why use CDP for tracing instead of Electron's built-in tracing?
- CDP tracing is well-documented
- Gives fine-grained rendering pipeline metrics
- Human-readable trace format
- Already used by DevTools

### Why launch fresh app per run?
- Avoids state carryover (memory growth, cache effects)
- Each run starts from identical state
- Simpler to reason about variance
- Trade-off: slower (but 3 runs is still ~2 min total)

### Why measure archives specifically?
- Good representative workload
- Animation-heavy (exercises Layout/Paint/Composite)
- Common user action
- Illustrates the `top` vs `transform` CSS issue mentioned in PRD

## Next Steps If Verification Fails

### If Playwright can't launch Electron:
- Check Electron executable path (should be at `node_modules/.bin/electron`)
- Try different Playwright version
- Fall back to raw Electron + CDP without Playwright

### If database seeding fails:
- Check if tables are auto-created by sync engine on first launch
- Look at what the sync engine creates in `edgehill.db`
- Manually create table schema before seeding

### If tracing fails:
- Fall back to Electron's `--trace-to-file` flag
- Use sampling-based measurement instead
- Use Electron's built-in profiler API

### If test selectors fail:
- Add fallback selectors (class names, role attributes)
- Use more robust XPath selectors
- Make the scenario interactive (pause and let user click)

## Files Created

```
benchmarks/
├── README.md                       # User-facing documentation
├── IMPLEMENTATION.md               # This file
├── tsconfig.json                   # TypeScript config for benchmarks
├── fixtures/
│   └── seed-account.ts             # Database seeding script
├── scenarios/
│   └── archive-message.ts          # Archive scenario + main entry point
├── lib/
│   ├── launch-electron.ts          # Electron launcher
│   ├── trace-capture.ts            # CDP tracing
│   ├── trace-parse.ts              # Trace parsing & aggregation
│   ├── report.ts                   # Results formatting
│   ├── test-launch.ts              # Verification script
├── results/                        # Where result files are saved
│   └── temp/                       # Temporary traces and per-run data
└── index.ts                        # (Recommended addition) Main re-export
```

Modified files:
- `package.json` - Added `benchmark` npm script

## Recommendations Before Running

1. **Build the project first**
   ```bash
   npm run build
   ```
   This ensures mailsync and all dependencies are available.

2. **Verify on a test account**
   ```bash
   # Start app normally and check that basic UI works
   npm start
   ```

3. **Check database path**
   - On Linux dev: `~/.config/Mailspring-dev/edgehill.db`
   - Verify it exists and is readable after running

4. **Use reasonable thread counts for testing**
   - 5 threads: Quick test (< 1 min total)
   - 25 threads: Production baseline (2-3 min total)
   - 100 threads: Stress test (5+ min total)

## Open Work (Out of Scope)

Per the PRD, these are not part of this harness:

- [ ] Fixing the `top`/`transform` CSS issue (that's the fix test!)
- [ ] Validating perceived smoothness on real GPU (BorBook only)
- [ ] Measuring every animation in the app (start with archive)
- [ ] CI integration (local tool for now)
- [ ] Comparison UI (manual JSON comparison for now)
