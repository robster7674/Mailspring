import fs from 'fs';
import path from 'path';
import { TraceMetrics } from './trace-parse';

export interface ResultsSummary {
  timestamp: string;
  gitSha: string;
  threadCount: number;
  runs: number;
  median: TraceMetrics;
  p95: TraceMetrics;
  min: TraceMetrics;
  max: TraceMetrics;
  mean: TraceMetrics;
}

export function saveResults(results: ResultsSummary, outputDir: string, gitSha: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${gitSha}-${timestamp}.json`;
  const filepath = path.join(outputDir, filename);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(filepath, JSON.stringify(results, null, 2));

  return filepath;
}

export function loadResults(filepath: string): ResultsSummary {
  const data = fs.readFileSync(filepath, 'utf-8');
  return JSON.parse(data);
}

export function formatMetricsTable(label: string, metrics: TraceMetrics): string {
  const lines = [
    `\n${label}`,
    '─'.repeat(60),
    `Layout Duration:          ${metrics.layoutDuration.toFixed(2)}ms`,
    `Paint Duration:           ${metrics.paintDuration.toFixed(2)}ms`,
    `Recalculate Style:        ${metrics.recalculateStyleDuration.toFixed(2)}ms`,
    `Composite Duration:       ${metrics.compositeDuration.toFixed(2)}ms`,
    `Total Main Thread Time:   ${metrics.totalMainThreadTime.toFixed(2)}ms`,
    `Frame Count:              ${metrics.frameCount}`,
    `Total Duration:           ${metrics.duration.toFixed(2)}ms`,
  ];
  return lines.join('\n');
}

export function printResults(results: ResultsSummary): void {
  console.log('\n' + '='.repeat(60));
  console.log('Performance Benchmark Results');
  console.log('='.repeat(60));
  console.log(`Runs: ${results.runs} | Threads: ${results.threadCount} | Git SHA: ${results.gitSha.slice(0, 8)}`);

  console.log(formatMetricsTable('Median', results.median));
  console.log(formatMetricsTable('P95', results.p95));
  console.log(formatMetricsTable('Min', results.min));
  console.log(formatMetricsTable('Max', results.max));
  console.log(formatMetricsTable('Mean', results.mean));
}

export interface ComparisonDelta {
  metric: string;
  baseline: number;
  current: number;
  delta: number;
  deltaPercent: number;
}

export function compareResults(baseline: ResultsSummary, current: ResultsSummary): ComparisonDelta[] {
  const deltas: ComparisonDelta[] = [];

  const metrics: (keyof TraceMetrics)[] = [
    'layoutDuration',
    'paintDuration',
    'recalculateStyleDuration',
    'compositeDuration',
    'totalMainThreadTime',
  ];

  const metricLabels: { [key: string]: string } = {
    layoutDuration: 'Layout Duration',
    paintDuration: 'Paint Duration',
    recalculateStyleDuration: 'Recalculate Style',
    compositeDuration: 'Composite Duration',
    totalMainThreadTime: 'Total Main Thread Time',
  };

  for (const metric of metrics) {
    const baselineValue = baseline.median[metric];
    const currentValue = current.median[metric];
    const delta = currentValue - baselineValue;
    const deltaPercent = (delta / baselineValue) * 100;

    deltas.push({
      metric: metricLabels[metric],
      baseline: baselineValue,
      current: currentValue,
      delta,
      deltaPercent,
    });
  }

  return deltas;
}

export function printComparison(baseline: ResultsSummary, current: ResultsSummary): void {
  const deltas = compareResults(baseline, current);

  console.log('\n' + '='.repeat(80));
  console.log('Performance Comparison (Baseline vs Current)');
  console.log('='.repeat(80));
  console.log(`Baseline: ${baseline.gitSha.slice(0, 8)} | Current: ${current.gitSha.slice(0, 8)}`);
  console.log('');

  console.log(
    `${'Metric'.padEnd(25)} ${'Baseline'.padEnd(12)} ${'Current'.padEnd(12)} ${'Delta'.padEnd(12)} ${'% Change'}`.padEnd(80)
  );
  console.log('─'.repeat(80));

  for (const delta of deltas) {
    const sign = delta.delta > 0 ? '+' : '';
    const percentSign = delta.deltaPercent > 0 ? '+' : '';
    const color = delta.deltaPercent > 5 ? '🔴' : delta.deltaPercent < -5 ? '🟢' : '';

    console.log(
      `${delta.metric.padEnd(25)} ${delta.baseline.toFixed(2).padEnd(12)} ${delta.current.toFixed(2).padEnd(12)} ${(sign + delta.delta.toFixed(2)).padEnd(12)} ${percentSign + delta.deltaPercent.toFixed(1)}% ${color}`
    );
  }

  console.log('');
  const worstDelta = deltas.reduce((a, b) => (Math.abs(b.deltaPercent) > Math.abs(a.deltaPercent) ? b : a));
  if (worstDelta.deltaPercent > 5) {
    console.log(`⚠️  ${worstDelta.metric} regressed by ${worstDelta.deltaPercent.toFixed(1)}%`);
  } else if (worstDelta.deltaPercent < -5) {
    console.log(`✨ ${worstDelta.metric} improved by ${Math.abs(worstDelta.deltaPercent).toFixed(1)}%`);
  } else {
    console.log('✓ Results are within normal variance');
  }
}
