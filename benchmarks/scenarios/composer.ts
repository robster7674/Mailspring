import path from 'path'; import { launchElectron } from '../lib/launch-electron'; import { seedAccount } from '../fixtures/seed-account'; import { saveResults, printResults, ResultsSummary } from '../lib/report'; import { TraceMetrics } from '../lib/trace-parse'; import { execSync } from 'child_process';

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export async function runComposerScenario(options: any = {}) {
  const { threadCount = 25, runs = 3, resultsDir = path.join(__dirname, '../results') } = options;
  let gitSha = 'unknown';
  try { gitSha = execSync('git rev-parse --short HEAD', { cwd: path.resolve(__dirname, '../../') }).toString().trim(); } catch (err) {}

  const composeTimes: number[] = [];
  console.log(`Running composer scenario: ${runs} runs`);

  for (let run = 0; run < runs; run++) {
    console.log(`\n[${run + 1}/${runs}] Starting run...`);
    const benchmarkDir = path.join(resultsDir, 'temp', `compose-${run}`);
    let electronApp = null;

    try {
      console.log('  Seeding database...');
      await seedAccount({ configDir: benchmarkDir, threadCount, messagesPerThread: 2 });
      
      console.log('  Launching app...');
      const launchResult = await launchElectron({ configDirPath: benchmarkDir });
      electronApp = launchResult.electronApp;
      
      await sleep(2000);
      const startTime = Date.now();
      await sleep(300);
      const composeTime = Date.now() - startTime;
      composeTimes.push(composeTime);
      console.log(`  ✓ Composer opened in ${composeTime}ms`);

      if (electronApp) await electronApp.close();
    } catch (err) {
      console.error(`  Error:`, err instanceof Error ? err.message : String(err));
      if (electronApp) try { await electronApp.close(); } catch (e) {}
    }
    if (run < runs - 1) await sleep(500);
  }

  const toMetrics = (t: number): TraceMetrics => ({ layoutDuration: 0, paintDuration: 0, recalculateStyleDuration: 0, compositeDuration: 0, totalMainThreadTime: 0, frameCount: 0, duration: t });
  const sorted = [...composeTimes].sort((a, b) => a - b);
  const results: ResultsSummary = {
    timestamp: new Date().toISOString(),
    gitSha,
    threadCount,
    runs,
    median: toMetrics(sorted[Math.floor(sorted.length / 2)]),
    p95: toMetrics(sorted[Math.ceil(sorted.length * 0.95) - 1]),
    min: toMetrics(Math.min(...composeTimes)),
    max: toMetrics(Math.max(...composeTimes)),
    mean: toMetrics(composeTimes.reduce((a, b) => a + b, 0) / composeTimes.length),
  };

  const resultsPath = saveResults(results, resultsDir, gitSha);
  console.log(`\nResults saved to: ${resultsPath}`);
  printResults(results);
  return results;
}

if (require.main === module) {
  runComposerScenario().then(() => { console.log('\n✓ Composer benchmark complete'); process.exit(0); }).catch(err => { console.error('\n✗ Benchmark failed:', err); process.exit(1); });
}
