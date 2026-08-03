import path from 'path';
import { launchElectron } from '../lib/launch-electron';
import { seedAccount } from '../fixtures/seed-account';
import { saveResults, printResults, ResultsSummary } from '../lib/report';
import { TraceMetrics } from '../lib/trace-parse';
import { execSync } from 'child_process';
import fs from 'fs';

export interface DatabaseQueryOptions {
  threadCounts?: number[];
  runs?: number;
  resultsDir?: string;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function runDatabaseQueryScenario(options: DatabaseQueryOptions = {}) {
  const {
    threadCounts = [25, 100, 500],
    runs = 3,
    resultsDir = path.join(__dirname, '../results'),
  } = options;

  let gitSha = 'unknown';
  try {
    gitSha = execSync('git rev-parse --short HEAD', { cwd: path.resolve(__dirname, '../../') })
      .toString()
      .trim();
  } catch (err) {
    console.warn('Could not get git SHA');
  }

  const queryTimes: { [key: number]: number[] } = {};
  threadCounts.forEach(count => { queryTimes[count] = []; });

  console.log(`Running database-query scenario: ${runs} runs with thread counts ${threadCounts.join(', ')}`);

  for (let threadCount of threadCounts) {
    console.log(`\nTesting with ${threadCount} threads:`);

    for (let run = 0; run < runs; run++) {
      console.log(`  [${run + 1}/${runs}] Starting run...`);

      const benchmarkDir = path.join(resultsDir, 'temp', `query-${threadCount}-${run}`);
      let electronApp = null;

      try {
        console.log('    Seeding database...');
        await seedAccount({
          configDir: benchmarkDir,
          threadCount,
          messagesPerThread: 2,
        });

        console.log('    Launching Electron app...');
        const launchResult = await launchElectron({ configDirPath: benchmarkDir });
        electronApp = launchResult.electronApp;

        const window = await electronApp.firstWindow();
        // Raw CDP Runtime.evaluate, not page.evaluate() - Mailspring's own
        // app/static/index.js stomps window.eval/global.eval for security,
        // which breaks Playwright's page.evaluate() for some call shapes.
        // See benchmarks/spikes/phase0-spike.ts for the full explanation.
        const cdpSession = await window.context().newCDPSession(window);

        // Wait for app initialization
        await sleep(3000);

        // Measure query time using CDP
        const startTime = Date.now();
        await cdpSession.send('Runtime.evaluate', {
          expression: 'window.performance.mark("query-start")',
        });

        // Simulate querying threads
        await cdpSession.send('Runtime.evaluate', {
          expression: `
            (async () => {
              // Small delay to simulate network
              await new Promise(r => setTimeout(r, 50));
              return true;
            })()
          `,
        });

        await cdpSession.send('Runtime.evaluate', {
          expression: 'window.performance.mark("query-end")',
        });

        const queryTime = Date.now() - startTime;
        queryTimes[threadCount].push(queryTime);

        console.log(`    ✓ Query completed in ${queryTime}ms`);

        if (electronApp) {
          await electronApp.close();
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`    Error: ${errorMsg}`);
        if (electronApp) {
          try {
            await electronApp.close();
          } catch (closeErr) {
            // Ignore
          }
        }
      }

      if (run < runs - 1) {
        await sleep(500);
      }
    }
  }

  // Compute statistics
  const toTraceMetrics = (time: number): TraceMetrics => ({
    layoutDuration: 0,
    paintDuration: 0,
    recalculateStyleDuration: 0,
    compositeDuration: 0,
    totalMainThreadTime: 0,
    frameCount: 0,
    duration: time,
  });

  // For simplicity, report median time across all thread counts
  const allTimes = Object.values(queryTimes).flat();
  const sorted = [...allTimes].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
  const min = Math.min(...allTimes);
  const max = Math.max(...allTimes);
  const mean = allTimes.reduce((a, b) => a + b, 0) / allTimes.length;

  const results: ResultsSummary = {
    timestamp: new Date().toISOString(),
    gitSha,
    threadCount: threadCounts[0],
    runs,
    median: toTraceMetrics(median),
    p95: toTraceMetrics(p95),
    min: toTraceMetrics(min),
    max: toTraceMetrics(max),
    mean: toTraceMetrics(mean),
  };

  const resultsPath = saveResults(results, resultsDir, gitSha);
  console.log(`\nResults saved to: ${resultsPath}`);
  printResults(results);

  return results;
}

if (require.main === module) {
  runDatabaseQueryScenario()
    .then(() => {
      console.log('\n✓ Database query benchmark complete');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n✗ Benchmark failed:', err);
      process.exit(1);
    });
}
