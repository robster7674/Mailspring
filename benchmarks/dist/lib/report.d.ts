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
export declare function saveResults(results: ResultsSummary, outputDir: string, gitSha: string): string;
export declare function loadResults(filepath: string): ResultsSummary;
export declare function formatMetricsTable(label: string, metrics: TraceMetrics): string;
export declare function printResults(results: ResultsSummary): void;
export interface ComparisonDelta {
    metric: string;
    baseline: number;
    current: number;
    delta: number;
    deltaPercent: number;
}
export declare function compareResults(baseline: ResultsSummary, current: ResultsSummary): ComparisonDelta[];
export declare function printComparison(baseline: ResultsSummary, current: ResultsSummary): void;
