# Intel Mac Startup Performance Investigation

## Critical Finding: 2.2 Second Silent Initialization

**Date**: 2026-07-23  
**Platform**: macOS Intel (BorBook)  
**Profiling Method**: `startup-profile` scenario with detailed timing

### Timing Breakdown

| Phase | Duration | Status |
|-------|----------|--------|
| Database Seeding | 32ms | ✓ **FAST** |
| Process Spawn | 0ms | ✓ **INSTANT** |
| **First App Output** | **2187ms** | ⚠️ **PROBLEM** |
| Process Init → Exit | 7823ms | ⚠️ **SLOW** |
| **Total Startup** | **10042ms** | ⚠️ **CRITICAL** |

### Analysis

**The app is SILENT for 2.2 seconds before producing any output.**

This means:
1. Database seeding is NOT the bottleneck (32ms)
2. Electron process spawn is NOT the bottleneck (0ms)
3. **Mailspring app initialization code is hanging/blocking for ~2.2 seconds**
4. After first output, shutdown takes another 7.8 seconds

### Comparison: Linux vs Intel Mac

| Metric | Linux (rob-dev) | Intel Mac (BorBook) | Difference |
|--------|---|---|---|
| **Total Startup** | 723ms | 10042ms | **13.9x slower** |
| Time to First Output | ~700ms | 2187ms | **3.1x slower** |
| App Silent Period | ~0ms | 2187ms | **New bottleneck** |

### Hypothesis: Where is the 2.2 Second Delay?

**Most Likely Candidates** (in order of probability):

1. **Electron/Chrome initialization on Intel macOS**
   - V8 engine startup
   - Chromium graphics initialization
   - Security scanning/notarization checks
   - System resource initialization

2. **Mailspring app.ready event handlers**
   - Module loading (internal packages)
   - Keyring initialization
   - Database connection establishment
   - Plugin system initialization

3. **System-level macOS overhead**
   - File system access patterns
   - Security framework checks
   - Display server initialization
   - Process isolation/sandboxing

4. **better-sqlite3 or database operations**
   - Database connection pooling
   - WAL mode initialization
   - File descriptor setup

### Investigation Steps

To pinpoint the exact bottleneck:

#### 1. **Add detailed logging to app startup**
   - Log at `app.on('will-finish-launching')`
   - Log at `app.on('ready')`
   - Log at `app.on('window-ready')`
   - Log in each internal package's `activate()` hook

#### 2. **Profile with Chrome DevTools**
   - Capture CPU profile during first 3 seconds
   - Look for blocking operations or event loops
   - Check for synchronous I/O or expensive computations

#### 3. **Test hypotheses**
   ```bash
   # Test 1: Is it Electron/V8?
   node -e "console.log('Ready'); process.exit(0)"
   # Measure: Should be <100ms
   
   # Test 2: Is it Mailspring app code?
   # Disable internal_packages temporarily
   # Run benchmark again
   # If faster: bottleneck is in plugin system
   
   # Test 3: Is it database?
   # Use in-memory database instead of SQLite
   # If faster: bottleneck is database initialization
   ```

#### 4. **Compare with other Electron apps**
   - VS Code startup time on same hardware
   - Slack startup time on same hardware
   - Discord startup time on same hardware
   - If they're also slow: macOS Electron issue
   - If they're fast: Mailspring-specific issue

### Current Results Summary

**Simple Startup (5 runs)**: 5247ms median, std dev 321ms  
**App Startup with CDP (3 runs)**: 8079ms median  
**Startup Profile (single run)**: 2187ms to first output, 10042ms total

The profiling clearly shows the app is **silent for 2.2 seconds**, which is the real problem.

### Next Steps

1. Add fine-grained logging to identify which system is stalling
2. Compare macOS app initialization to Linux (this session)
3. Profile with Chrome DevTools during startup
4. Test with stripped-down app (no plugins, no keyring, etc.)
5. Measure on other Electron apps for comparison

### Files for Investigation

- `app/src/browser/main.js` - Entry point, app lifecycle
- `app/src/browser/mailsync-process.ts` - Sync engine startup
- `app/src/browser/mailsync-bridge.ts` - Sync engine communication
- `app/src/registries/` - Extension/plugin loading
- `app/internal_packages/*/lib/main.ts` - Plugin activation hooks

Look for:
- Synchronous file I/O
- Blocking database operations
- Network calls (should be async)
- Heavy computations
- Unoptimized event handlers
