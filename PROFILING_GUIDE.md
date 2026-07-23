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
**Infrastructure**: Already set up in benchmarking

Detailed CPU, memory, and network profiling.

```bash
npm run benchmark
# App will start with --remote-debugging-port=9222
# Open DevTools in another Electron window
```

**Use for**: Deep CPU profiling, memory leaks, network waterfall

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

## Example Profiling Session

```bash
# 1. Establish baseline
npm run benchmark
# Saves results to benchmarks/dist/results/

# 2. Enable detailed startup profiling
PROFILE_STARTUP=1 npm start 2>&1 | tee startup-profile.log

# 3. Look for timing gaps in output
# [PROFILE] T+0ms: startup-profiler-initialized
# [PROFILE] T+3ms (+3ms): main.js-loaded
# [PROFILE] T+50ms (+47ms): app-ready-event-fired  ← 47ms gap
# [PROFILE] T+1200ms (+1150ms): mailsync-migrate-start ← BIG 1150ms GAP!

# 4. Investigate the gap
# Find what's happening between app-ready and mailsync-migrate

# 5. Implement optimization

# 6. Measure improvement
npm run benchmark
# Compare with baseline

# 7. Commit and document
git add benchmarks/dist/results/
git commit -m "Performance: Optimize X, improve startup by Yms"
```

---

## Next Steps

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
   ADVANCED_PROFILE=1 npm start
   ```

5. **Review summary**:
   ```bash
   # Profiler prints summary on exit
   # Shows: event loop blocks, wakelocks, lock contention, races
   ```

This comprehensive profiling infrastructure will help identify performance issues at multiple levels!
