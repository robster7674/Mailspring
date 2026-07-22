export interface TraceMetrics {
    layoutDuration: number;
    paintDuration: number;
    recalculateStyleDuration: number;
    compositeDuration: number;
    totalMainThreadTime: number;
    frameCount: number;
    duration: number;
}
export declare function parseTrace(traceFile: string): TraceMetrics;
export declare function aggregateMetrics(allMetrics: TraceMetrics[]): {
    median: TraceMetrics;
    p95: TraceMetrics;
    min: TraceMetrics;
    max: TraceMetrics;
    mean: TraceMetrics;
};
