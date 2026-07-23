# Comprehensive Performance Profiling Guide

## Available Profiling Tools

### 1. Startup Performance Profiler ✓
**File**: `app/src/browser/startup-profiler.js`

Measures app initialization timing with high-resolution marks.

```bash
PROFILE_STARTUP=1 npm start
```

Output:
```
[PROFILE] T+0ms: startup-profiler-initialized
[PROFILE] T+3ms (+3ms): main.js-loaded
[PROFILE] T+50ms (+47ms): app-ready-event-fired
...
```

**Use for**: Detecting slow initialization phases, startup bottlenecks

---

### 2. Advanced Performance Profiler (NEW)
**File**: `app/src/browser/performance-profiler.js`

In-depth detection of:
- **Event loop blocking** (main thread congestion)
- **Wakelocks** (long-running async operations)
- **Lock contention** (synchronization issues)
- **Race conditions** (operations called too frequently)

```typescript
const profiler = require('./performance-profiler');
const advancedProfiler = profiler.initAdvancedProfiler(true);

// Monitor event loop
advancedProfiler.monitorEventLoop();

// Track async operations
const promise = fetchData();
advancedProfiler.trackAsyncOperation('fetch-data', promise);

// Create mutexes to detect contention
const dbLock = advancedProfiler.createMutex('database-access');
await dbLock.lock();
try {
  // ... database operations
} finally {
  dbLock.unlock();
}

// Track operation frequency
advancedProfiler.trackOperation('render-view', viewId);

// Get summary report
const summary = advancedProfiler.getSummary();
advancedProfiler.printSummary();
```

**Use for**: Detecting wakelocks, race conditions, lock contention

---

### 3. Chrome DevTools Protocol (CDP)
**Infrastructure**: Built into Electron (no browser required)

Deep application-level profiling: CPU flame graphs, memory heap snapshots, performance timeline, network requests.

**Setup** (no Chrome browser needed — Electron has CDP built-in):

```bash
# Start with debugging port
npm start -- --remote-debugging-port=9222

# In another terminal, open DevTools programmatically or via client:
# Option 1: Chrome DevTools (chrome://devtools/ → connect to localhost:9222)
# Option 2: VS Code debugger (just works)
# Option 3: Custom CDP client (used in benchmarks)
```

**Quick CPU Profile**:
1. Start app: `npm start -- --remote-debugging-port=9222`
2. Open Chrome DevTools: `chrome://devtools/` → three dots → More tools → Remote devices
3. Under Discovered devices, connect to localhost:9222
4. Switch to Performance tab
5. Click record, do work (e.g., open message, delete email), click stop
6. Examine timeline: shows exact breakdown (scripting, rendering, layout, etc.)

**Why CDP for Application Profiling**: Shows *where time is actually spent* with millisecond precision, not just "event loop was blocked." Better than custom profiler for root-cause analysis.

**Use for**: Root cause analysis ("why is action X slow?"), memory leaks, performance bottleneck deep dives

---

### 4. Node.js Built-in Profiler
**Tool**: `node --prof` / `node --inspect`

CPU sampling at V8 level.

```bash
# CPU profiling
node --prof app/src/browser/main.js
# Generates v8.log (process it with node --prof-process)

# Live inspection
node --inspect app/src/browser/main.js
# Open chrome://inspect in Chrome
```

**Use for**: Low-level V8 optimization, garbage collection analysis

---

### 5. Benchmark Scenarios
**Directory**: `benchmarks/scenarios/`

Run realistic workload scenarios to measure performance impact.

```bash
npm run benchmark

# Run single scenario
npm run benchmark:compile
node benchmarks/dist/scenarios/database-query.js
node benchmarks/dist/scenarios/list-render.js
```

**Available scenarios**:
- simple-startup
- app-startup
- database-query
- search
- initial-sync
- list-render
- folder-navigation
- message-open
- composer
- attachment-upload

**Use for**: Regression detection, workload-based performance analysis

---

## Choosing the Right Tool

| Scenario | Best Tool | Why |
|----------|-----------|-----|
| "Is the app starting slowly?" | Startup Profiler | Quick timeline view |
| "Which startup phase is bottleneck?" | Startup Profiler + CDP | Startup profiler shows gaps, CDP shows why |
| "Event loop blocking during normal use?" | Custom Profiler | Real-time terminal feedback |
| "Why is message deletion slow?" | CDP | See exact execution breakdown (scripting, rendering, etc.) |
| "Is database contention happening?" | Custom Profiler | Designed to detect lock contention |
| "Memory leak suspected?" | CDP (heap snapshots) | Compare heap snapshots before/after |
| "Which function calls are slowest?" | CDP (flame graphs) or `node --inspect` | Exact call stack timing |
| "V8 garbage collection issues?" | `node --inspect` | GC timeline and allocation tracking |
| "Regression detection in CI?" | Benchmark scenarios | Quantitative metrics over time |

**Quick Decision Tree**:
1. **Quick diagnosis** (1 min) → Custom Profiler: `ADVANCED_PROFILE=1 npm start`
2. **Find root cause** (5 min) → CDP: `npm start -- --remote-debugging-port=9222`, then DevTools
3. **Deep V8 analysis** → `node --inspect` for GC and optimization details
4. **Automated testing** → Benchmark scenarios: `npm run benchmark`

---

## Profiling Checklist

### Before Optimizing
- [ ] Run baseline benchmarks: `npm run benchmark`
- [ ] Save results to compare against
- [ ] Document current performance

### Finding the Bottleneck
- [ ] Check event loop blocking: `PROFILE_STARTUP=1 npm start`
- [ ] Look for large [PROFILE] timing gaps
- [ ] Run advanced profiler to detect wakelocks
- [ ] Check Chrome DevTools for CPU/memory issues

### Verifying Fixes
- [ ] Run benchmarks again: `npm run benchmark`
- [ ] Compare results with baseline
- [ ] Check for regressions in other scenarios
- [ ] Verify on both Linux and macOS

### Documenting Results
- [ ] Save benchmark JSON files with git commit
- [ ] Update BENCHMARKS.md with new metrics
- [ ] Document what was optimized and why

---

## Common Profiling Tasks

### Detect Event Loop Blocking

```javascript
const { initAdvancedProfiler } = require('./performance-profiler');
const profiler = initAdvancedProfiler(true);
profiler.monitorEventLoop();

// Do work...
// Later:
profiler.printSummary();
// Output shows blocks >16ms (60fps threshold)
```

### Find Long-Running Async Operations

```javascript
const { getAdvancedProfiler } = require('./performance-profiler');
const profiler = getAdvancedProfiler();

async function slowOperation() {
  return new Promise(resolve => {
    // Simulates 2-second operation
    setTimeout(() => resolve(), 2000);
  });
}

// Track it
const result = await profiler.trackAsyncOperation(
  'slow-operation',
  slowOperation()
);

// Will warn: [PERF] Async operation "slow-operation" took 2000ms
```

### Detect Lock Contention

```javascript
const dbLock = profiler.createMutex('database-transactions');

async function dbQuery(sql) {
  const lockId = await dbLock.lock();
  try {
    // If contended, warns: [PERF] Lock "database-transactions" contended (N waiters)
    return await executeQuery(sql);
  } finally {
    dbLock.unlock();
  }
}
```

### Find Race Conditions

```javascript
// Track if operation is called too frequently
profiler.trackOperation('render-view', viewId);
profiler.trackOperation('render-view', viewId); // Will warn if >3 in sequence

// Output: [PERF] Potential race: "render-view" called 4 times in 1s
```

---

## Interpreting Results

### Event Loop Blocking
- **<16ms**: Normal (60fps threshold)
- **16-50ms**: Noticeable, may cause jank
- **>100ms**: User-visible lag, needs optimization

**Common causes**:
- Synchronous file I/O
- Large array operations
- Expensive computations
- Blocking loops

**Fix**: Move to worker threads, use async operations, chunk work

### Wakelocks
- **<100ms**: Normal async operations
- **100ms-1s**: Slow but acceptable
- **>1s**: Investigate, may block UI

**Common causes**:
- Database queries without index
- Network timeouts
- Unoptimized algorithms
- Synchronous subprocess spawning

**Fix**: Add indexes, optimize queries, use async patterns

### Lock Contention
- **0 waiters**: Healthy, no contention
- **1-2 waiters**: Minor contention, monitor
- **>2 waiters**: Significant contention, needs refactoring

**Common causes**:
- Single lock protecting too much data
- Hold locks too long
- Nested lock acquisition

**Fix**: Finer-grained locks, minimize critical sections

### Race Conditions
- **Called <3 times/sec**: Normal
- **Called 3-10 times/sec**: Suspicious, check logic
- **Called >10 times/sec**: Likely race condition

**Common causes**:
- Multiple event handlers for same action
- Async callbacks not properly serialized
- Missing debounce/throttle on updates

**Fix**: Debounce, serialize access, fix logic flow

---

## Integration with CI/CD

Add to `package.json`:

```json
{
  "scripts": {
    "perf:baseline": "npm run benchmark > perf-baseline.json",
    "perf:check": "npm run benchmark > perf-current.json && node scripts/compare-perf.js",
    "perf:profile": "PROFILE_STARTUP=1 npm start"
  }
}
```

Compare script example:

```javascript
// scripts/compare-perf.js
const baseline = require('./perf-baseline.json');
const current = require('./perf-current.json');

for (const scenario of Object.keys(current.results)) {
  const curr = current.results[scenario].median;
  const base = baseline.results[scenario].median;
  const pct = ((curr - base) / base) * 100;
  
  if (pct > 10) {
    console.error(`❌ ${scenario}: +${pct.toFixed(1)}% regression`);
    process.exit(1);
  } else if (pct < -5) {
    console.log(`✅ ${scenario}: ${pct.toFixed(1)}% improvement`);
  }
}
```

---

## Example Profiling Sessions

### Session 1: Quick Diagnosis (Custom Profiler)
```bash
# 1. Run with custom profiler
ADVANCED_PROFILE=1 npm start

# 2. Reproduce issue (e.g., delete message, scroll list)
# Terminal shows real-time alerts:
# [PERF] Event loop blocked for 145ms
# [PERF] Lock "database-access" contended (2 waiters)
# [PERF] Potential race: "select-message" called 8 times in 1s

# 3. Summary on exit shows high-level metrics
# Tells you: is it event loop? lock contention? race condition?
```

### Session 2: Startup Performance (Startup Profiler + CDP)
```bash
# 1. Quick timeline with startup profiler
PROFILE_STARTUP=1 npm start 2>&1 | tee startup.log

# Output shows:
# [PROFILE] T+0ms: startup-profiler-initialized
# [PROFILE] T+50ms (+50ms): app-ready-event-fired
# [PROFILE] T+1200ms (+1150ms): mailsync-migrate-start ← 1.15s gap!

# 2. Now deep dive with CDP
npm start -- --remote-debugging-port=9222
# In Chrome: DevTools → Performance → record → app startup → stop
# See exact breakdown: parsing, compilation, script execution, etc.
```

### Session 3: Feature Performance (CDP Deep Dive)
```bash
# 1. Start app with CDP
npm start -- --remote-debugging-port=9222

# 2. Connect Chrome DevTools
# chrome://devtools/ → three dots → More tools → Remote devices
# Select localhost:9222

# 3. Performance tab → record
# Do action: select message, delete email, search inbox
# Stop recording

# 4. Analyze timeline:
# - Scripting: which functions took longest?
# - Rendering: layout thrashing? paint time?
# - Memory: unexpected allocations?

# 5. If bottleneck found (e.g., "search takes 2s"):
# - Check if it's database query (add index)
# - Check if it's rendering (virtualize list)
# - Check if it's IPC (batch requests)
```

### Session 4: Automated Regression Detection
```bash
# 1. Establish baseline
npm run benchmark
# Saves results to benchmarks/dist/results/

# 2. Implement optimization

# 3. Measure improvement
npm run benchmark
# Compare with baseline

# 4. Commit and document
git add benchmarks/dist/results/
git commit -m "Performance: Optimize X, improve startup by Yms"
```

---

## Using CDP on macOS (BorBook)

No special setup needed — Electron has CDP built-in:

```bash
# Start Mailspring with debugging port
npm start -- --remote-debugging-port=9222

# Open Chrome DevTools in another window
# Option 1: Use Chrome/Chromium browser
open -a "Google Chrome" "chrome://devtools/"
# Then: More tools → Remote devices → Connect to localhost:9222

# Option 2: Use Chrome/Edge/Brave (any Chromium browser)
open -a "Brave" "chrome://devtools/"

# Option 3: Use VS Code debugger
# Just works automatically if you have Debugger for Chrome extension
```

**Performance recording on macOS**:
1. Connect DevTools to localhost:9222
2. Switch to **Performance** tab (not Console/Sources)
3. Click red circle to **start recording**
4. Do action in Mailspring (e.g., message deletion, list scroll)
5. Click stop to end recording
6. Review timeline:
   - Look for long yellow/purple bars (scripting)
   - Look for red/orange bars (rendering)
   - Check memory usage (may indicate leak)

**Pro tip**: Use Safari DevTools instead if you prefer native macOS tools:
- Develop menu in Safari → Connect to Mailspring
- Same performance profiling available
- No need to open Chrome

---

## How Custom Profiler and CDP Complement Each Other

**Custom Profiler shows**:
- High-level app metrics (event loop, lock contention)
- Application-specific issues (race conditions)
- Always-on monitoring (cheap overhead)
- Quick diagnosis without visuals

**CDP shows**:
- Where time is *actually* spent (flame graphs)
- Rendering/layout performance
- Memory allocations and leaks
- Network request waterfall
- Detailed timeline visualization

**Typical workflow**:
1. Run custom profiler: `ADVANCED_PROFILE=1 npm start`
2. See alert: `[PERF] Event loop blocked for 150ms`
3. Open CDP to investigate why
4. CDP flame graph shows: 140ms in `searchMessages()` function
5. Optimize that function, test with custom profiler again

---

## Integration with Development

To use advanced profiling in Mailspring:

1. **Enable in application.ts**:
   ```javascript
   const { initAdvancedProfiler } = require('./performance-profiler');
   const profiler = initAdvancedProfiler(process.env.ADVANCED_PROFILE === '1');
   ```

2. **Add around async operations**:
   ```javascript
   await profiler.trackAsyncOperation('operation-name', asyncFn());
   ```

3. **Create mutexes for critical sections**:
   ```javascript
   const databaseLock = profiler.createMutex('database');
   ```

4. **Run with profiling enabled**:
   ```bash
   # Quick diagnosis
   ADVANCED_PROFILE=1 npm start
   
   # Deep dive with CDP
   npm start -- --remote-debugging-port=9222
   ```

5. **Review results**:
   ```bash
   # Custom profiler: Terminal output with summary on exit
   # CDP: Visual timeline in Chrome DevTools
   ```

This multi-level profiling infrastructure will help identify performance issues from high-level metrics down to execution-line details!
