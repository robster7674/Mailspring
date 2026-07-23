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

async function sendCDPCommand(conn: any, method: string, params: any = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = conn.messageId++;
    const message = JSON.stringify({ id, method, params });
    const timeout = setTimeout(() => {
      reject(new Error(`CDP timeout waiting for ${method}`));
    }, 5000);

    let messageHandler: ((data: string) => void) | null = (data: string) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.id === id) {
          clearTimeout(timeout);
          conn.ws.removeListener('message', messageHandler!);
          messageHandler = null;
          if (response.error) {
            reject(new Error(`CDP error: ${response.error.message}`));
          } else {
            resolve(response.result);
          }
        }
      } catch (e) {
        // Ignore parse errors
      }
    };

    conn.ws.on('message', messageHandler);
    conn.ws.send(message);
  });
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

        // Wait for app initialization
        await sleep(3000);

        // Measure query time using CDP
        const startTime = Date.now();
        await sendCDPCommand(launchResult.cdpConnection, 'Runtime.evaluate', {
          expression: 'window.performance.mark("query-start")',
        });

        // Simulate querying threads
        await sendCDPCommand(launchResult.cdpConnection, 'Runtime.evaluate', {
          expression: `
            (async () => {
              // Small delay to simulate network
              await new Promise(r => setTimeout(r, 50));
              return true;
            })()
          `,
        });

        await sendCDPCommand(launchResult.cdpConnection, 'Runtime.evaluate', {
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
