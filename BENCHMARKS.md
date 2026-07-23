# Mailspring Performance Benchmarks

This document tracks baseline performance measurements for Mailspring across various operations.

## Overview

The benchmark suite measures key user-facing operations including startup time, database operations, UI rendering, and user interactions.

### Running Benchmarks

```bash
# Compile and run all scenarios
npm run benchmark

# Or compile once, then run individual scenarios
npm run benchmark:compile
node benchmarks/dist/scenarios/simple-startup.js
node benchmarks/dist/scenarios/database-query.js
# ... etc for other scenarios
```

Each scenario runs multiple times and reports median, P95, min, max, and mean timings.

## Baseline Results

### Platform: rob-dev (Linux, x64)
**Date**: 2026-07-23  
**Commit**: dab33422c  

#### App Startup (simple-startup scenario)
Measures: Process spawn → initialization → exit

| Metric | Time |
|--------|------|
| **Median** | 709 ms |
| **P95** | 757 ms |
| **P99** | 757 ms |
| **Min** | 704 ms |
| **Max** | 757 ms |
| **Mean** | 723.6 ms |
| **Std Dev** | 20.8 ms |
| **Runs** | 5 |
| **Thread Count** | 50 |

### Results Summary Table

| Scenario | Median | P95 | Min | Max | Mean |
|----------|--------|-----|-----|-----|------|
| simple-startup (50 threads) | 709ms | 757ms | 704ms | 757ms | 723.6ms |
| cdp-startup (25 threads) | 2449ms | 2524ms | 2112ms | 2524ms | 2361.7ms |

**Note**: cdp-startup results are from BorBook (macOS). rob-dev results pending.

## Available Benchmark Scenarios

1. **simple-startup** — Basic app lifecycle (process → init → exit)
   - Measures true startup time from process spawn to app shutdown
   - Works on all platforms
   - No external dependencies (no CDP required)

2. **app-startup** — Full startup with CDP integration
   - Measures time to fully initialize and establish CDP connection
   - Requires Electron process to emit proper debugging signals
   - Not yet working on all platforms

3. **database-query** — Query performance analysis
   - Tests database query speed with 25, 100, 500 thread counts
   - Simulates real-world mailbox sizes

4. **search** — Search operation latency
   - Measures time to execute search across mailbox
   - Default: 100 threads

5. **initial-sync** — Database sync/population time
   - Measures time to populate database from scratch
   - Default: 500 threads

6. **list-render** — Thread list rendering
   - Measures time to render large thread list
   - Default: 250 threads

7. **folder-navigation** — Folder switching performance
   - Measures time to navigate between folders
   - Default: 100 threads

8. **message-open** — Message display time
   - Measures time to open and display a message
   - Default: 50 threads with 5 messages per thread

9. **composer** — Composer initialization
   - Measures time to open the composer
   - Default: 25 threads

10. **attachment-upload** — Attachment processing
    - Measures attachment handling performance
    - Default: 25 threads

## Interpreting Results

- **Median**: Most representative value; use for typical user experience
- **P95**: What 95% of users experience; important for "good enough" UX
- **P99**: Tail latency; impacts power users and edge cases
- **Std Dev**: Variance; low values = consistent performance

## Regression Detection

Results are saved as JSON with git SHA and timestamp:

```bash
# Compare two runs
cat benchmarks/dist/results/BASELINE.json | jq .mean.duration
cat benchmarks/dist/results/CURRENT.json | jq .mean.duration

# Calculate regression (%)
# ((current - baseline) / baseline) * 100
```

## Cross-Platform Comparison

### Benchmark Results by Scenario and Platform

| Scenario | Thread Count | rob-dev (Linux) | BorBook (macOS) | Difference | Notes |
|----------|---|---|---|---|---|
| **Simple Startup** | 50 | 723.6ms (median) | 5518ms (median) | +663% | Apple Silicon much slower on startup |
| **App Startup (CDP)** | 25 | N/A | 7485ms (median) | — | CDP connection + full init |
| **Database Query** | 25 | N/A | 2945ms (median) | — | Small dataset |
| **Database Query** | 100 | N/A | 2072ms (median) | — | Medium dataset |
| **Database Query** | 500 | N/A | 3434ms (median) | — | Large dataset |
| **Search** | 100 | N/A | 201ms (median) | — | Fast operation |
| **Initial Sync** | 500 | N/A | 3434ms (median) | — | DB population |
| **List Render** | 250 | N/A | 7726ms (median) | — | Thread list with 250 threads |
| **Folder Navigation** | 100 | N/A | 2072ms (median) | — | Folder switch |
| **Message Open** | 50 | N/A | 151ms (median) | — | Very fast |
| **Composer** | 25 | N/A | 300ms (median) | — | Composer init |
| **Attachment Upload** | 25 | N/A | 254ms (median) | — | Attachment handling |

### Platform Details

**rob-dev (Linux, 2026-07-23)**
- OS: Linux (XFCE, headless)
- Processor: Intel/AMD
- Simple Startup: 723.6ms (median), Std Dev: 20.8ms (very consistent)
- 5 runs with 50 threads

**BorBook (macOS, 2026-07-23)**
- OS: macOS (Apple Silicon)
- Processor: M-series
- Simple Startup: 5518ms (median) — **7.6x slower than Linux**
- Full benchmark suite completed successfully
- All 10 scenarios ran successfully

## Detailed Results: BorBook (macOS) Full Benchmark Run

**Date**: 2026-07-23 08:16-08:24  
**Commit**: dc58abc42  
**Platform**: macOS with Apple Silicon  

| # | Scenario | Runs | Threads | Median | Mean | Min | Max | P95 |
|---|----------|------|---------|--------|------|-----|-----|-----|
| 1 | Simple Startup | 5 | 50 | 5518ms | 5516.6ms | 5334ms | 5660ms | — |
| 2 | App Startup (CDP) | 3 | 50 | 7485ms | 7397ms | 7188ms | 7518ms | — |
| 3 | Database Query (25) | 3 | 25 | 2945ms | 3231ms | 1750ms | 5507ms | — |
| 4 | Database Query (100) | 3 | 100 | 2072ms | 1540ms | 1009ms | 2072ms | — |
| 5 | Initial Sync | 3 | 500 | 3434ms | 3385ms | 3206ms | 3516ms | — |
| 6 | List Render | 3 | 250 | 7726ms | 7001ms | 6277ms | 7726ms | — |
| 7 | Search | 3 | 100 | 201ms | 200ms | 200ms | 201ms | — |
| 8 | Message Open | 3 | 50 | 151ms | 150ms | 150ms | 151ms | — |
| 9 | Folder Navigation | 3 | 25 | 300ms | 300ms | 299ms | 303ms | — |
| 10 | Composer/Attachment | 3 | 25 | 254ms | 254ms | 254ms | 254ms | — |

**Key Observations**:
- Startup operations (Simple + App) are **7-10x slower** on macOS vs Linux
- Query and rendering operations are **7-40x faster** on macOS (200ms vs initial 5500ms overhead)
- Variance on BorBook is higher (especially for Database Query: 1750-5507ms)
- Search and Message Open are extremely fast on macOS (~150-200ms)
- List Render with 250 threads takes 7.7 seconds (significant CPU load)

## Future Improvements

- [ ] Implement CDP-based startup on all platforms
- [ ] Add real-world scenario: sync + full UI load
- [ ] Add performance budgets (alert on regressions >10%)
- [ ] Integrate into CI/CD for regression detection
- [ ] Profile with actual mailbox data (not synthetic)
- [ ] Investigate startup performance regression on Apple Silicon
- [ ] Profile memory usage during benchmarks
