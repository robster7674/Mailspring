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

When running on different machines, use the table above to track:

| Platform | simple-startup | cdp-startup | Notes |
|----------|----------------|-------------|-------|
| rob-dev | 723.6ms | TBD | Linux, headless |
| BorBook | TBD | 2361.7ms | macOS, graphics |

## Future Improvements

- [ ] Implement CDP-based startup on all platforms
- [ ] Add real-world scenario: sync + full UI load
- [ ] Add performance budgets (alert on regressions >10%)
- [ ] Integrate into CI/CD for regression detection
- [ ] Profile with actual mailbox data (not synthetic)
