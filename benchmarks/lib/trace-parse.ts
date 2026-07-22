import fs from 'fs';

export interface TraceMetrics {
  layoutDuration: number;
  paintDuration: number;
  recalculateStyleDuration: number;
  compositeDuration: number;
  totalMainThreadTime: number;
  frameCount: number;
  duration: number;
}

interface TraceEvent {
  name: string;
  dur?: number;
  ts?: number;
  args?: any;
  ph?: string;
  tid?: number;
}

export function parseTrace(traceFile: string): TraceMetrics {
  const rawData = fs.readFileSync(traceFile, 'utf-8');
  const events: TraceEvent[] = JSON.parse(rawData);

  let layoutDuration = 0;
  let paintDuration = 0;
  let recalculateStyleDuration = 0;
  let compositeDuration = 0;
  let frameCount = 0;
  let minTs = Infinity;
  let maxTs = -Infinity;

  const eventCounts: { [key: string]: number } = {};

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
    } else if (name === 'Paint') {
      paintDuration += dur;
    } else if (name === 'RecalculateStyle') {
      recalculateStyleDuration += dur;
    } else if (name === 'CompositeLayers' || name === 'Composite Layers') {
      compositeDuration += dur;
    } else if (name === 'BeginFrame') {
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

export function aggregateMetrics(allMetrics: TraceMetrics[]): {
  median: TraceMetrics;
  p95: TraceMetrics;
  min: TraceMetrics;
  max: TraceMetrics;
  mean: TraceMetrics;
} {
  if (allMetrics.length === 0) {
    throw new Error('No metrics to aggregate');
  }

  const sorted = (key: keyof TraceMetrics) => {
    return allMetrics.sort((a, b) => a[key] - b[key]);
  };

  const getPercentile = (key: keyof TraceMetrics, percentile: number) => {
    const sorted = (key: keyof TraceMetrics) => {
      return allMetrics.sort((a, b) => a[key] - b[key]);
    };
    const index = Math.ceil((percentile / 100) * allMetrics.length) - 1;
    return sorted(key)[Math.max(0, index)][key];
  };

  const mean = (key: keyof TraceMetrics) => {
    const sum = allMetrics.reduce((acc, m) => acc + m[key], 0);
    return sum / allMetrics.length;
  };

  const keys: (keyof TraceMetrics)[] = [
    'layoutDuration',
    'paintDuration',
    'recalculateStyleDuration',
    'compositeDuration',
    'totalMainThreadTime',
    'frameCount',
    'duration',
  ];

  const median: TraceMetrics = {} as TraceMetrics;
  const p95: TraceMetrics = {} as TraceMetrics;
  const min: TraceMetrics = {} as TraceMetrics;
  const max: TraceMetrics = {} as TraceMetrics;
  const meanMetrics: TraceMetrics = {} as TraceMetrics;

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
