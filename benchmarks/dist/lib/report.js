"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveResults = saveResults;
exports.loadResults = loadResults;
exports.formatMetricsTable = formatMetricsTable;
exports.printResults = printResults;
exports.compareResults = compareResults;
exports.printComparison = printComparison;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function saveResults(results, outputDir, gitSha) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${gitSha}-${timestamp}.json`;
    const filepath = path_1.default.join(outputDir, filename);
    fs_1.default.mkdirSync(outputDir, { recursive: true });
    fs_1.default.writeFileSync(filepath, JSON.stringify(results, null, 2));
    return filepath;
}
function loadResults(filepath) {
    const data = fs_1.default.readFileSync(filepath, 'utf-8');
    return JSON.parse(data);
}
function formatMetricsTable(label, metrics) {
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
function printResults(results) {
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
function compareResults(baseline, current) {
    const deltas = [];
    const metrics = [
        'layoutDuration',
        'paintDuration',
        'recalculateStyleDuration',
        'compositeDuration',
        'totalMainThreadTime',
    ];
    const metricLabels = {
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
function printComparison(baseline, current) {
    const deltas = compareResults(baseline, current);
    console.log('\n' + '='.repeat(80));
    console.log('Performance Comparison (Baseline vs Current)');
    console.log('='.repeat(80));
    console.log(`Baseline: ${baseline.gitSha.slice(0, 8)} | Current: ${current.gitSha.slice(0, 8)}`);
    console.log('');
    console.log(`${'Metric'.padEnd(25)} ${'Baseline'.padEnd(12)} ${'Current'.padEnd(12)} ${'Delta'.padEnd(12)} ${'% Change'}`.padEnd(80));
    console.log('─'.repeat(80));
    for (const delta of deltas) {
        const sign = delta.delta > 0 ? '+' : '';
        const percentSign = delta.deltaPercent > 0 ? '+' : '';
        const color = delta.deltaPercent > 5 ? '🔴' : delta.deltaPercent < -5 ? '🟢' : '';
        console.log(`${delta.metric.padEnd(25)} ${delta.baseline.toFixed(2).padEnd(12)} ${delta.current.toFixed(2).padEnd(12)} ${(sign + delta.delta.toFixed(2)).padEnd(12)} ${percentSign + delta.deltaPercent.toFixed(1)}% ${color}`);
    }
    console.log('');
    const worstDelta = deltas.reduce((a, b) => (Math.abs(b.deltaPercent) > Math.abs(a.deltaPercent) ? b : a));
    if (worstDelta.deltaPercent > 5) {
        console.log(`⚠️  ${worstDelta.metric} regressed by ${worstDelta.deltaPercent.toFixed(1)}%`);
    }
    else if (worstDelta.deltaPercent < -5) {
        console.log(`✨ ${worstDelta.metric} improved by ${Math.abs(worstDelta.deltaPercent).toFixed(1)}%`);
    }
    else {
        console.log('✓ Results are within normal variance');
    }
}
