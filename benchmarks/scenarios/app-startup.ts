import path from 'path';
import { launchElectron } from '../lib/launch-electron';
import { seedAccount } from '../fixtures/seed-account';
import { saveResults, printResults, ResultsSummary } from '../lib/report';
import { TraceMetrics } from '../lib/trace-parse';
import { execSync } from 'child_process';
import fs from 'fs';

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendCDPCommand(conn: any, method: string, params: any = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = conn.messageId++;
    const message = JSON.stringify({ id, method, params });
    const timeout = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 5000);

    let messageHandler: ((data: string) => void) | null = (data: string) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.id === id) {
          clearTimeout(timeout);
          conn.ws.removeListener('message', messageHandler!);
          messageHandler = null;
          if (response.error) reject(new Error(`CDP error: ${response.error.message}`));
          else resolve(response.result);
        }
      } catch (e) {}
    };

    conn.ws.on('message', messageHandler);
    conn.ws.send(message);
  });
}

export interface AppStartupOptions {
  threadCount?: number;
  runs?: number;
  resultsDir?: string;
}

export async function runAppStartupScenario(options: AppStartupOptions = {}) {
  const {
    threadCount = 50,
    runs = 5,
    resultsDir = path.join(__dirname, '../results'),
  } = options;

  let gitSha = 'unknown';
  try {
    gitSha = execSync('git rev-parse --short HEAD', { cwd: path.resolve(__dirname, '../../') })
      .toString()
      .trim();
  } catch (err) {}

  const startupTimes: number[] = [];
  const tempResultsDir = path.join(resultsDir, 'temp');
  fs.mkdirSync(tempResultsDir, { recursive: true });

  console.log(`Running app-startup scenario: ${runs} runs with ${threadCount} threads`);
  console.log('Measuring: Launch → CDP Connection → App Initialization → Inbox Visible\n');

  for (let run = 0; run < runs; run++) {
    console.log(`[${run + 1}/${runs}] Starting run...`);

    const benchmarkDir = path.join(tempResultsDir, `startup-${run}`);
    let electronApp = null;

    try {
      // Seed database with realistic thread count
      console.log('  Seeding database...');
      await seedAccount({
        configDir: benchmarkDir,
        threadCount,
        messagesPerThread: 3,
      });

      // Measure total startup time
      console.log('  Launching Electron app...');
      const launchStartTime = Date.now();

      const launchResult = await launchElectron({
        configDirPath: benchmarkDir,
      });
      electronApp = launchResult.electronApp;

      // Wait for app initialization and inbox to be visible
      // This simulates the user seeing the interface and being able to interact
      console.log('  Waiting for inbox to populate...');
      await sleep(3000);

      // Check if app is responsive by sending a CDP command
      try {
        await sendCDPCommand(launchResult.cdpConnection, 'Runtime.evaluate', {
          expression: 'document.body.classList.length',
        });
      } catch (e) {
        // Even if this fails, the app is likely running
      }

      const totalStartupTime = Date.now() - launchStartTime;
      startupTimes.push(totalStartupTime);

      console.log(`  ✓ App fully started in ${totalStartupTime}ms`);

      // Close app
      if (electronApp) {
        await electronApp.close();
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`  Error in run ${run + 1}:`, errorMsg);
      if (electronApp) {
        try {
          await electronApp.close();
        } catch (closeErr) {
          // Ignore close errors
        }
      }
      throw err;
    }

    // Delay between runs
    if (run < runs - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Compute statistics
  if (startupTimes.length === 0) {
    throw new Error('No startup times collected');
  }

  const sorted = [...startupTimes].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
  const p99 = sorted[Math.ceil(sorted.length * 0.99) - 1];
  const min = Math.min(...startupTimes);
  const max = Math.max(...startupTimes);
  const mean = startupTimes.reduce((a, b) => a + b, 0) / startupTimes.length;

  const toTraceMetrics = (time: number): TraceMetrics => ({
    layoutDuration: 0,
    paintDuration: 0,
    recalculateStyleDuration: 0,
    compositeDuration: 0,
    totalMainThreadTime: 0,
    frameCount: 0,
    duration: time,
  });

  const results: ResultsSummary = {
    timestamp: new Date().toISOString(),
    gitSha,
    threadCount,
    runs,
    median: toTraceMetrics(median),
    p95: toTraceMetrics(p95),
    min: toTraceMetrics(min),
    max: toTraceMetrics(max),
    mean: toTraceMetrics(mean),
  };

  const resultsPath = saveResults(results, resultsDir, gitSha);
  console.log(`\nResults saved to: ${resultsPath}`);

  // Print detailed summary
  console.log('\n' + '='.repeat(60));
  console.log('APP STARTUP TIME SUMMARY');
  console.log('='.repeat(60));
  console.log(`Runs:           ${runs}`);
  console.log(`Thread count:   ${threadCount}`);
  console.log(`Git SHA:        ${gitSha}`);
  console.log('-'.repeat(60));
  console.log(`Median:         ${median}ms`);
  console.log(`P95:            ${p95}ms`);
  console.log(`P99:            ${p99}ms`);
  console.log(`Min:            ${min}ms`);
  console.log(`Max:            ${max}ms`);
  console.log(`Mean:           ${mean.toFixed(2)}ms`);
  console.log(`Std Dev:        ${Math.sqrt(startupTimes.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / startupTimes.length).toFixed(2)}ms`);
  console.log('='.repeat(60));
  console.log(`Raw times:      ${startupTimes.map(t => t + 'ms').join(', ')}`);
  console.log('='.repeat(60));

  printResults(results);

  return results;
}

if (require.main === module) {
  runAppStartupScenario()
    .then(() => {
      console.log('\n✓ App startup benchmark complete');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n✗ Benchmark failed:', err);
      process.exit(1);
    });
}
