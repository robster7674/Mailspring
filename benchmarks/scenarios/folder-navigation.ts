import path from 'path';
import { launchElectron } from '../lib/launch-electron';
import { seedAccount } from '../fixtures/seed-account';
import { saveResults, printResults, ResultsSummary } from '../lib/report';
import { TraceMetrics } from '../lib/trace-parse';
import { execSync } from 'child_process';

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// Real scenario: drives actual ArrowDown keypresses through the message list,
// same code path diagnosed for event-loop-block outliers (message-store.ts's
// debounced _onFocusChanged -> _fetchFromCache, multiselect-list.tsx's
// keymap handlers). Previously this file didn't interact with the app at
// all - it slept 200ms and reported that as "nav time".
export async function runFolderNavigationScenario(options: any = {}) {
  const {
    threadCount = 10,
    keyPresses = 20,
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

  const navTimes: number[] = [];
  console.log(`Running folder-navigation scenario: ${runs} runs, ${keyPresses} ArrowDown presses each`);

  for (let run = 0; run < runs; run++) {
    console.log(`\n[${run + 1}/${runs}] Starting run...`);
    const benchmarkDir = path.join(resultsDir, 'temp', `nav-${run}`);
    let electronApp = null;

    try {
      console.log('  Seeding database...');
      await seedAccount({ configDir: benchmarkDir, threadCount, messagesPerThread: 2 });

      console.log('  Launching app...');
      const launchResult = await launchElectron({ configDirPath: benchmarkDir });
      electronApp = launchResult.electronApp;

      const window = await electronApp.firstWindow();

      console.log('  Waiting for thread list to load...');
      await window.locator('.thread-list .list-item').first().waitFor({ timeout: 30000 });
      await window.locator('.thread-list .list-item').first().click();
      await sleep(500);

      console.log(`  Pressing ArrowDown ${keyPresses} times...`);
      const startTime = Date.now();
      for (let i = 0; i < keyPresses; i++) {
        await window.keyboard.press('ArrowDown');
      }
      // Settle: the last focus change is debounced 100ms
      // (message-store.ts's _onFocusChanged) before the message fetch fires.
      await sleep(300);
      const navTime = Date.now() - startTime;
      navTimes.push(navTime);
      console.log(`  ✓ ${keyPresses} ArrowDown presses completed in ${navTime}ms`);

      if (electronApp) await electronApp.close();
    } catch (err) {
      console.error(`  Error:`, err instanceof Error ? err.message : String(err));
      if (electronApp)
        try {
          await electronApp.close();
        } catch (e) {
          // ignore
        }
      throw err;
    }
    if (run < runs - 1) await sleep(500);
  }

  const toMetrics = (t: number): TraceMetrics => ({
    layoutDuration: 0,
    paintDuration: 0,
    recalculateStyleDuration: 0,
    compositeDuration: 0,
    totalMainThreadTime: 0,
    frameCount: 0,
    duration: t,
  });
  const sorted = [...navTimes].sort((a, b) => a - b);
  const results: ResultsSummary = {
    timestamp: new Date().toISOString(),
    gitSha,
    threadCount,
    runs,
    median: toMetrics(sorted[Math.floor(sorted.length / 2)]),
    p95: toMetrics(sorted[Math.ceil(sorted.length * 0.95) - 1]),
    min: toMetrics(Math.min(...navTimes)),
    max: toMetrics(Math.max(...navTimes)),
    mean: toMetrics(navTimes.reduce((a, b) => a + b, 0) / navTimes.length),
  };

  const resultsPath = saveResults(results, resultsDir, gitSha);
  console.log(`\nResults saved to: ${resultsPath}`);
  printResults(results);
  return results;
}

if (require.main === module) {
  runFolderNavigationScenario()
    .then(() => {
      console.log('\n✓ Folder navigation benchmark complete');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n✗ Benchmark failed:', err);
      process.exit(1);
    });
}
