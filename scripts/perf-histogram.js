#!/usr/bin/env node
/**
 * Summarizes [PERF:main] / [PERF:renderer] "Event loop blocked for Nms" lines
 * captured by the ADVANCED_PROFILE profiler (see PROFILING_GUIDE.md) into a
 * per-process histogram + percentiles (p50/p90/p95/p99/max).
 *
 * Usage:
 *   node scripts/perf-histogram.js path/to/mailspring-YYYYMMDD-HHMMSS.log
 *   npm start ... 2>&1 | node scripts/perf-histogram.js        # read stdin
 */
const fs = require('fs');
const readline = require('readline');

const LINE_RE = /\[PERF:(\w+)\] Event loop blocked for (\d+)ms/;

// Buckets chosen around the thresholds PROFILING_GUIDE.md uses to judge
// severity (16ms = frame budget, 100ms = user-visible lag).
const BUCKETS = [
  { max: 50, label: '16-50ms' },
  { max: 100, label: '50-100ms' },
  { max: 200, label: '100-200ms' },
  { max: 500, label: '200-500ms' },
  { max: 1000, label: '500ms-1s' },
  { max: 2000, label: '1s-2s' },
  { max: Infinity, label: '2s+' },
];

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function summarize(label, durations) {
  if (durations.length === 0) return;
  const sorted = [...durations].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);

  console.log(`\n[PERF:${label}] ${sorted.length} event-loop blocks`);
  console.log(
    `  min ${sorted[0]}ms  mean ${Math.round(sum / sorted.length)}ms  ` +
      `p50 ${percentile(sorted, 50)}ms  p90 ${percentile(sorted, 90)}ms  ` +
      `p95 ${percentile(sorted, 95)}ms  p99 ${percentile(sorted, 99)}ms  max ${sorted[sorted.length - 1]}ms`
  );

  const counts = BUCKETS.map(() => 0);
  for (const d of sorted) {
    const i = BUCKETS.findIndex((b) => d <= b.max);
    counts[i === -1 ? BUCKETS.length - 1 : i]++;
  }
  const maxCount = Math.max(...counts);
  const barWidth = 40;
  BUCKETS.forEach((b, i) => {
    const bar = '#'.repeat(maxCount ? Math.round((counts[i] / maxCount) * barWidth) : 0);
    console.log(`  ${b.label.padStart(9)} | ${bar.padEnd(barWidth)} ${counts[i]}`);
  });
}

async function main() {
  const filePath = process.argv[2];
  const input = filePath ? fs.createReadStream(filePath) : process.stdin;
  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  const byProcess = {};

  for await (const line of rl) {
    const match = LINE_RE.exec(line);
    if (!match) continue;
    const [, proc, ms] = match;
    (byProcess[proc] = byProcess[proc] || []).push(Number(ms));
  }

  const total = Object.values(byProcess).reduce((a, arr) => a + arr.length, 0);
  if (total === 0) {
    console.log('No "[PERF:*] Event loop blocked" lines found.');
    return;
  }

  for (const proc of Object.keys(byProcess).sort()) {
    summarize(proc, byProcess[proc]);
  }
}

main();
