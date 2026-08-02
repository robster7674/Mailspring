/**
 * Phase 0 spike (see /home/rob/.claude/plans/humming-growing-beacon.md).
 *
 * Throwaway - answers one question before any real tracing code gets written:
 * do perf_hooks marks (main process) and window.performance marks (renderer)
 * both end up inside Electron's contentTracing output, or does the main-
 * process side need a separate node_trace.*.log correlated by timestamp?
 *
 * Run: cd benchmarks && npx ts-node spikes/phase0-spike.ts
 * (or: npm run benchmark:compile && node dist/spikes/phase0-spike.js)
 *
 * Delete this file once the answer is written up in app/src/tracing/spans.ts.
 */
import { _electron as electron } from 'playwright';
import path from 'path';
import fs from 'fs';
import os from 'os';

async function main() {
  const projectRoot = path.resolve(__dirname, '../../../');
  const appPath = path.join(projectRoot, 'app');
  const configDirPath = path.join(os.tmpdir(), 'mailspring-phase0-spike');
  fs.mkdirSync(configDirPath, { recursive: true });

  console.log('Launching Electron via Playwright...');
  // Without executablePath, Playwright downloads/uses its own default
  // Electron build instead of this repo's pinned node_modules/electron -
  // wrong binary for testing this app.
  //
  // The --no-sandbox/--disable-gpu/--no-zygote flags below were added while
  // chasing a Linux-only failure (child process killed 15s in, never
  // establishing its IPC connection - see git history of this file). That
  // was fixed by switching CI to macos-latest instead, not by any of these
  // flags, which is why they're now gated to Linux only - no reason to
  // carry Linux-container workarounds onto a real desktop OS.
  const linuxOnlyArgs = process.platform === 'linux'
    ? ['--no-sandbox', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage', '--disable-software-rasterizer']
    : [];

  const app = await electron.launch({
    executablePath: require('electron') as unknown as string,
    timeout: 60000,
    args: [appPath, '--enable-logging', '--dev', ...linuxOnlyArgs],
    env: { ...process.env, MAILSPRING_CONFIG_DIR: configDirPath } as any,
  });

  const proc = app.process();
  console.log(`App process pid=${proc.pid}, stdout=${!!proc.stdout}, stderr=${!!proc.stderr}`);
  proc.stdout?.on('data', (d: Buffer) => process.stdout.write(`[app stdout] ${d}`));
  proc.stderr?.on('data', (d: Buffer) => process.stderr.write(`[app stderr] ${d}`));
  proc.on('exit', (code, signal) =>
    console.log(`App process exited early: code=${code} signal=${signal}`)
  );

  const windowWaitStart = Date.now();
  const stillWaiting = setInterval(() => {
    console.log(
      `Still waiting for a window after ${Date.now() - windowWaitStart}ms ` +
        `(process alive: ${proc.exitCode === null})`
    );
  }, 10000);

  let window;
  try {
    window = await app.firstWindow({ timeout: 90000 });
  } finally {
    clearInterval(stillWaiting);
  }
  console.log('Got first window:', await window.title().catch(() => '(no title yet)'));

  // Snapshot node_trace.*.log files that might already exist, so we can tell
  // whether new ones appear after enabling perf_hooks tracing in main.
  const cwdBefore = new Set(
    fs.readdirSync(projectRoot).filter(f => f.startsWith('node_trace'))
  );

  const traceOutputPath = path.join(os.tmpdir(), `mailspring-spike-trace-${Date.now()}.json`);

  console.log('Starting contentTracing in main process...');
  try {
    await app.evaluate(async ({ contentTracing }) => {
      await contentTracing.startRecording({
        included_categories: [
          'blink.user_timing',
          'node.perf.usertiming',
          'disabled-by-default-v8.cpu_profiler',
          'devtools.timeline',
        ],
      } as any);
    });
  } catch (err) {
    console.error('contentTracing.startRecording failed - API shape may differ on this Electron version:', err);
    throw err;
  }

  console.log('Enabling main-process perf_hooks -> trace_events bridge and marking...');
  try {
    await app.evaluate(async () => {
      const { createTracing } = require('trace_events');
      const { performance } = require('perf_hooks');
      const tracing = createTracing({ categories: ['node.perf.usertiming'] });
      tracing.enable();
      performance.mark('spike-main-start');
      let x = 0;
      for (let i = 0; i < 1e6; i++) x += i;
      performance.mark('spike-main-end');
      performance.measure('spike-main-span', 'spike-main-start', 'spike-main-end');
      // Give the trace writer a moment to flush before disabling.
      await new Promise(resolve => setTimeout(resolve, 200));
      tracing.disable();
      return x;
    });
  } catch (err) {
    console.error('Main-process perf_hooks/trace_events step failed:', err);
    throw err;
  }

  console.log('Marking in renderer via window.performance...');
  try {
    await window.evaluate(() => {
      (window as any).performance.mark('spike-renderer-start');
      let x = 0;
      for (let i = 0; i < 1e6; i++) x += i;
      (window as any).performance.mark('spike-renderer-end');
      (window as any).performance.measure(
        'spike-renderer-span',
        'spike-renderer-start',
        'spike-renderer-end'
      );
      return x;
    });
  } catch (err) {
    console.error('Renderer window.performance step failed:', err);
    throw err;
  }

  console.log('Stopping contentTracing...');
  let resultPath = traceOutputPath;
  try {
    resultPath = await app.evaluate(async ({ contentTracing }, outPath) => {
      return await contentTracing.stopRecording(outPath);
    }, traceOutputPath);
  } catch (err) {
    console.error('contentTracing.stopRecording failed:', err);
  }
  console.log('contentTracing wrote to:', resultPath);

  await app.close();

  // --- Inspect results ---
  console.log('\n=== SPIKE RESULTS ===');

  if (fs.existsSync(resultPath)) {
    const raw = fs.readFileSync(resultPath, 'utf-8');
    console.log(`contentTracing file (${resultPath}, ${raw.length} bytes):`);
    console.log(`  contains "spike-renderer" marks: ${raw.includes('spike-renderer')}`);
    console.log(`  contains "spike-main" marks:     ${raw.includes('spike-main')}`);
  } else {
    console.log(`contentTracing output file not found at ${resultPath}`);
  }

  const cwdAfter = fs.readdirSync(projectRoot).filter(f => f.startsWith('node_trace'));
  const newTraceFiles = cwdAfter.filter(f => !cwdBefore.has(f));
  if (newTraceFiles.length > 0) {
    console.log(`\nSeparate node_trace.*.log file(s) appeared in ${projectRoot}:`);
    for (const f of newTraceFiles) {
      const p = path.join(projectRoot, f);
      const raw = fs.readFileSync(p, 'utf-8');
      console.log(`  ${f} (${raw.length} bytes) contains "spike-main": ${raw.includes('spike-main')}`);
    }
  } else {
    console.log(`\nNo separate node_trace.*.log file appeared in ${projectRoot} (checked before/after).`);
  }

  console.log(
    '\nRecord the answer (one merged file vs. two correlated files, and whether marks ' +
      'actually showed up at all) in app/src/tracing/spans.ts, then delete this spike file.'
  );
}

main().catch(err => {
  console.error('Spike failed:', err);
  process.exit(1);
});
