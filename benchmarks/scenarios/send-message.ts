import path from 'path';
import { launchElectron } from '../lib/launch-electron';
import { seedAccount } from '../fixtures/seed-account';
import { saveResults, printResults, ResultsSummary } from '../lib/report';
import { TraceMetrics } from '../lib/trace-parse';
import { execSync } from 'child_process';
import { ElectronApplication, Page } from 'playwright';

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// Finds the composer across all windows (it may open as an inline pane in
// the main window or a popout window depending on workspace mode), matching
// the proven pattern in playwright/helpers.ts's findComposer().
async function findComposer(electronApp: ElectronApplication, timeoutMs = 15000): Promise<Page | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const page of electronApp.windows()) {
      try {
        if ((await page.locator('.composer-inner-wrap').count()) > 0) return page;
      } catch {
        // window may still be loading
      }
    }
    await sleep(300);
  }
  return null;
}

// Real scenario: drives an actual compose -> fill -> send flow through the
// real app, same code path diagnosed for event-loop-block outliers
// (send-draft-task.ts's applyExtensionTransforms DOM parsing, mailsync-
// bridge.ts's _onQueueTask). Seeded accounts point at localhost IMAP/SMTP
// (fixtures/seed-account.ts) with no real server listening, so actual
// network delivery isn't expected to succeed - what's measured here is the
// local, synchronous portion of the send flow: from pressing the send
// shortcut until the composer dismisses (SendDraftTask.forSending() runs
// synchronously before that dismissal), which is exactly the portion of
// the flow capable of blocking the event loop.
export async function runSendMessageScenario(options: any = {}) {
  const {
    threadCount = 25,
    bodyLength = 2000,
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

  const sendTimes: number[] = [];
  console.log(`Running send-message scenario: ${runs} runs`);

  for (let run = 0; run < runs; run++) {
    console.log(`\n[${run + 1}/${runs}] Starting run...`);
    const benchmarkDir = path.join(resultsDir, 'temp', `send-${run}`);
    let electronApp: ElectronApplication | null = null;

    try {
      console.log('  Seeding database...');
      await seedAccount({ configDir: benchmarkDir, threadCount, messagesPerThread: 2 });

      console.log('  Launching app...');
      const launchResult = await launchElectron({ configDirPath: benchmarkDir });
      electronApp = launchResult.electronApp;

      const window = await electronApp.firstWindow();
      console.log('  Waiting for compose button...');
      await window.locator('.item-compose').waitFor({ timeout: 30000 });

      console.log('  Opening composer...');
      await window.locator('.item-compose').click();
      const composerPage = await findComposer(electronApp);
      if (!composerPage) throw new Error('Composer did not open');

      const composer = composerPage.locator('.composer-inner-wrap').first();
      await composer.waitFor({ timeout: 10000 });

      console.log('  Filling recipient...');
      const toField = composer.locator('.composer-participant-field').first();
      await toField.locator('input').click();
      await composerPage.keyboard.type('recipient@example.com');
      await composerPage.keyboard.press('Comma');
      await sleep(300);

      console.log('  Filling body...');
      const bodyEditable = composer.locator('[contenteditable="true"]').first();
      await bodyEditable.click();
      // Realistic-ish body length, since applyExtensionTransforms's DOM
      // parse cost scales with body size.
      await composerPage.keyboard.type('A'.repeat(bodyLength), { delay: 0 });
      await sleep(200);

      console.log('  Sending...');
      const startTime = Date.now();
      await composerPage.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');

      // Composer dismisses once SendDraftTask.forSending() and
      // Actions.queueTask() have run - the synchronous, main-thread portion
      // of the send flow. Poll for it to disappear from any window.
      const sendStart = Date.now();
      let composerGone = false;
      while (Date.now() - sendStart < 15000) {
        let stillOpen = false;
        for (const page of electronApp.windows()) {
          try {
            if ((await page.locator('.composer-inner-wrap').count()) > 0) {
              stillOpen = true;
              break;
            }
          } catch {
            // window may be closing
          }
        }
        if (!stillOpen) {
          composerGone = true;
          break;
        }
        await sleep(50);
      }
      if (!composerGone) throw new Error('Composer did not dismiss after send within 15s');

      const sendTime = Date.now() - startTime;
      sendTimes.push(sendTime);
      console.log(`  ✓ Send (local portion) completed in ${sendTime}ms`);

      await electronApp.close();
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
  const sorted = [...sendTimes].sort((a, b) => a - b);
  const results: ResultsSummary = {
    timestamp: new Date().toISOString(),
    gitSha,
    threadCount,
    runs,
    median: toMetrics(sorted[Math.floor(sorted.length / 2)]),
    p95: toMetrics(sorted[Math.ceil(sorted.length * 0.95) - 1]),
    min: toMetrics(Math.min(...sendTimes)),
    max: toMetrics(Math.max(...sendTimes)),
    mean: toMetrics(sendTimes.reduce((a, b) => a + b, 0) / sendTimes.length),
  };

  const resultsPath = saveResults(results, resultsDir, gitSha);
  console.log(`\nResults saved to: ${resultsPath}`);
  printResults(results);
  return results;
}

if (require.main === module) {
  runSendMessageScenario()
    .then(() => {
      console.log('\n✓ Send message benchmark complete');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n✗ Benchmark failed:', err);
      process.exit(1);
    });
}
