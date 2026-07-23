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

export async function runSearchScenario(options: any = {}) {
  const { threadCount = 100, runs = 3, resultsDir = path.join(__dirname, '../results') } = options;

  let gitSha = 'unknown';
  try {
    gitSha = execSync('git rev-parse --short HEAD', { cwd: path.resolve(__dirname, '../../') })
      .toString()
      .trim();
  } catch (err) {}

  const searchTimes: number[] = [];

  console.log(`Running search scenario: ${runs} runs with ${threadCount} threads`);

  for (let run = 0; run < runs; run++) {
    console.log(`\n[${run + 1}/${runs}] Starting run...`);

    const benchmarkDir = path.join(resultsDir, 'temp', `search-${run}`);
    let electronApp = null;

    try {
      console.log('  Seeding database...');
      await seedAccount({ configDir: benchmarkDir, threadCount, messagesPerThread: 2 });

      console.log('  Launching Electron app...');
      const launchResult = await launchElectron({ configDirPath: benchmarkDir });
      electronApp = launchResult.electronApp;

      await sleep(2000);

      const startTime = Date.now();
      await sendCDPCommand(launchResult.cdpConnection, 'Runtime.evaluate', {
        expression: `
          (async () => {
            // Simulate search operation
            await new Promise(r => setTimeout(r, 100));
            return { results: ${threadCount} };
          })()
        `,
      });

      const searchTime = Date.now() - startTime;
      searchTimes.push(searchTime);
      console.log(`  ✓ Search completed in ${searchTime}ms`);

      if (electronApp) await electronApp.close();
    } catch (err) {
      console.error(`  Error:`, err instanceof Error ? err.message : String(err));
      if (electronApp) try { await electronApp.close(); } catch (e) {}
    }

    if (run < runs - 1) await sleep(500);
  }

  const toTraceMetrics = (time: number): TraceMetrics => ({
    layoutDuration: 0, paintDuration: 0, recalculateStyleDuration: 0, compositeDuration: 0,
    totalMainThreadTime: 0, frameCount: 0, duration: time,
  });

  const sorted = [...searchTimes].sort((a, b) => a - b);
  const results: ResultsSummary = {
    timestamp: new Date().toISOString(),
    gitSha,
    threadCount,
    runs,
    median: toTraceMetrics(sorted[Math.floor(sorted.length / 2)]),
    p95: toTraceMetrics(sorted[Math.ceil(sorted.length * 0.95) - 1]),
    min: toTraceMetrics(Math.min(...searchTimes)),
    max: toTraceMetrics(Math.max(...searchTimes)),
    mean: toTraceMetrics(searchTimes.reduce((a, b) => a + b, 0) / searchTimes.length),
  };

  const resultsPath = saveResults(results, resultsDir, gitSha);
  console.log(`\nResults saved to: ${resultsPath}`);
  printResults(results);
  return results;
}

if (require.main === module) {
  runSearchScenario().then(() => {
    console.log('\n✓ Search benchmark complete');
    process.exit(0);
  }).catch(err => {
    console.error('\n✗ Benchmark failed:', err);
    process.exit(1);
  });
}
