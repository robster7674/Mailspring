// Wires the advanced performance profiler up in a renderer window (see
// app/src/browser/performance-profiler.js). The main process already runs
// its own instance (app/src/browser/main.js), but that only sees main-process
// event loop blocking - app lifecycle, IPC, talking to mailsync. The actual
// UI thread (message list, composer, scrolling, React rendering) runs here,
// in the renderer, on a completely separate event loop. Without this, main
// process profiling alone can miss the jank users actually feel.
//
// Renderer console output only shows up in that window's own DevTools
// console, invisible to anyone just watching the terminal. This routes
// alerts over IPC to the main process, which prints them to the same
// terminal/log as everything else, tagged [PERF:renderer] to distinguish
// them from main-process alerts.
export function bootstrapRendererProfiler() {
  if (process.env.ADVANCED_PROFILE !== '1') {
    return;
  }

  const { ipcRenderer } = require('electron');
  const { initAdvancedProfiler } = require('./browser/performance-profiler.js');

  const profilerMode = process.env.PROFILER_MODE || 'production';
  const profiler = initAdvancedProfiler(true, profilerMode, {
    processLabel: 'renderer',
    logSink: (level: string, message: string) => {
      ipcRenderer.send('renderer-perf-alert', { level, message });
    },
  });

  profiler.monitorEventLoop();
}
