import path from 'path';
import { launchElectron } from '../lib/launch-electron';
import { seedAccount } from '../fixtures/seed-account';
import { saveResults, printResults, ResultsSummary } from '../lib/report';
import { TraceMetrics } from '../lib/trace-parse';
import { execSync } from 'child_process';
import fs from 'fs';

export interface StartupScenarioOptions {
  threadCount?: number;
  messagesPerThread?: number;
  runs?: number;
  resultsDir?: string;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function runStartupScenario(options: StartupScenarioOptions = {}) {
  const {
    threadCount = 25,
    messagesPerThread = 2,
    runs = 3,
    resultsDir = path.join(__dirname, '../results'),
  } = options;

  // Get current git SHA
  let gitSha = 'unknown';
  try {
    gitSha = execSync('git rev-parse --short HEAD', { cwd: path.resolve(__dirname, '../../') })
      .toString()
      .trim();
  } catch (err) {
    console.warn('Could not get git SHA');
  }

  const startupTimes: number[] = [];
  const tempResultsDir = path.join(resultsDir, 'temp');
  fs.mkdirSync(tempResultsDir, { recursive: true });

  console.log(`Running startup scenario: ${runs} runs with ${threadCount} threads`);

  for (let run = 0; run < runs; run++) {
    console.log(`\n[${run + 1}/${runs}] Starting run...`);

    const benchmarkDir = path.join(tempResultsDir, `run-${run}`);

    let electronApp = null;
    try {
      // Seed the database
      console.log('  Seeding database...');
      await seedAccount({
        configDir: benchmarkDir,
        threadCount,
        messagesPerThread,
      });

      // Launch Electron and measure startup time
      console.log('  Launching Electron app...');
      const startTime = Date.now();
      const launchResult = await launchElectron({
        configDirPath: benchmarkDir,
      });
      const launchTime = Date.now() - startTime;
      electronApp = launchResult.electronApp;

      console.log(`  ✓ App launched in ${launchTime}ms`);

      // Wait for app initialization
      console.log('  Waiting for app initialization...');
      await sleep(2000);

      startupTimes.push(launchTime);

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

    // Small delay between runs
    if (run < runs - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Compute statistics
  if (startupTimes.length === 0) {
    throw new Error('No startup times collected');
  }

  const sorted = [...startupTimes].sort((a, b) => a - b);
  const medianTime = sorted[Math.floor(sorted.length / 2)];
  const p95Time = sorted[Math.ceil(sorted.length * 0.95) - 1];
  const minTime = Math.min(...startupTimes);
  const maxTime = Math.max(...startupTimes);
  const meanTime = startupTimes.reduce((a, b) => a + b, 0) / startupTimes.length;

  // Create TraceMetrics objects from startup times (store in duration field)
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
    median: toTraceMetrics(medianTime),
    p95: toTraceMetrics(p95Time),
    min: toTraceMetrics(minTime),
    max: toTraceMetrics(maxTime),
    mean: toTraceMetrics(meanTime),
  };

  // Save results
  const resultsPath = saveResults(results, resultsDir, gitSha);
  console.log(`\nResults saved to: ${resultsPath}`);

  // Print results
  printResults(results);

  return results;
}

if (require.main === module) {
  runStartupScenario()
    .then(() => {
      console.log('\n✓ Startup benchmark complete');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n✗ Benchmark failed:', err);
      process.exit(1);
    });
}
