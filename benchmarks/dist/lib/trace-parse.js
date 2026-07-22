"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTrace = parseTrace;
exports.aggregateMetrics = aggregateMetrics;
const fs_1 = __importDefault(require("fs"));
function parseTrace(traceFile) {
    const rawData = fs_1.default.readFileSync(traceFile, 'utf-8');
    const events = JSON.parse(rawData);
    let layoutDuration = 0;
    let paintDuration = 0;
    let recalculateStyleDuration = 0;
    let compositeDuration = 0;
    let frameCount = 0;
    let minTs = Infinity;
    let maxTs = -Infinity;
    const eventCounts = {};
    for (const event of events) {
        const name = event.name || '';
        const dur = event.dur || 0;
        const ts = event.ts || 0;
        // Track timing range
        if (ts > 0) {
            minTs = Math.min(minTs, ts);
            maxTs = Math.max(maxTs, ts + dur);
        }
        // Count event occurrences
        if (!eventCounts[name]) {
            eventCounts[name] = 0;
        }
        eventCounts[name]++;
        // Aggregate durations by event type
        if (name === 'Layout') {
            layoutDuration += dur;
        }
        else if (name === 'Paint') {
            paintDuration += dur;
        }
        else if (name === 'RecalculateStyle') {
            recalculateStyleDuration += dur;
        }
        else if (name === 'CompositeLayers' || name === 'Composite Layers') {
            compositeDuration += dur;
        }
        else if (name === 'BeginFrame') {
            frameCount++;
        }
    }
    // Duration is in microseconds, convert to milliseconds
    const duration = (maxTs - minTs) / 1000;
    // Total main-thread time is sum of all major events
    const totalMainThreadTime = (layoutDuration + paintDuration + recalculateStyleDuration + compositeDuration) / 1000;
    return {
        layoutDuration: layoutDuration / 1000,
        paintDuration: paintDuration / 1000,
        recalculateStyleDuration: recalculateStyleDuration / 1000,
        compositeDuration: compositeDuration / 1000,
        totalMainThreadTime,
        frameCount,
        duration,
    };
}
function aggregateMetrics(allMetrics) {
    if (allMetrics.length === 0) {
        throw new Error('No metrics to aggregate');
    }
    const sorted = (key) => {
        return allMetrics.sort((a, b) => a[key] - b[key]);
    };
    const getPercentile = (key, percentile) => {
        const sorted = (key) => {
            return allMetrics.sort((a, b) => a[key] - b[key]);
        };
        const index = Math.ceil((percentile / 100) * allMetrics.length) - 1;
        return sorted(key)[Math.max(0, index)][key];
    };
    const mean = (key) => {
        const sum = allMetrics.reduce((acc, m) => acc + m[key], 0);
        return sum / allMetrics.length;
    };
    const keys = [
        'layoutDuration',
        'paintDuration',
        'recalculateStyleDuration',
        'compositeDuration',
        'totalMainThreadTime',
        'frameCount',
        'duration',
    ];
    const median = {};
    const p95 = {};
    const min = {};
    const max = {};
    const meanMetrics = {};
    for (const key of keys) {
        const values = sorted(key).map(m => m[key]);
        const index = Math.floor(allMetrics.length / 2);
        median[key] = values[index];
        p95[key] = getPercentile(key, 95);
        min[key] = values[0];
        max[key] = values[values.length - 1];
        meanMetrics[key] = mean(key);
    }
    return { median, p95, min, max, mean: meanMetrics };
}
