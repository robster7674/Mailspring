/**
 * Throwaway diagnostic (see git history / PR discussion on
 * feature/perf-tracing-phase1-benchmark-driver). Tests whether a first-time
 * launch against a brand-new --config-dir-path is what's blowing Chromium's
 * fixed 15s child-process-connection budget on this CI runner, by launching
 * twice against the SAME directory and comparing outcomes.
 *
 * Delete this file once the question is answered.
 */
import path from 'path';
import { launchElectron } from '../lib/launch-electron';
import { seedAccount } from '../fixtures/seed-account';

async function attempt(label: string, configDirPath: string) {
  console.log(`\n--- ${label} (dir: ${configDirPath}) ---`);
  const start = Date.now();
  try {
    const { electronApp } = await launchElectron({ configDirPath });
    const elapsed = Date.now() - start;
    console.log(`${label}: SUCCESS after ${elapsed}ms`);
    await electronApp.close();
    return true;
  } catch (err) {
    const elapsed = Date.now() - start;
    console.log(`${label}: FAILED after ${elapsed}ms - ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

async function main() {
  const configDirPath = path.join(require('os').tmpdir(), 'mailspring-userdata-warmup-test');
  await seedAccount({ configDir: configDirPath, threadCount: 10, messagesPerThread: 2 });

  const first = await attempt('First launch (cold userData dir)', configDirPath);
  const second = await attempt('Second launch (same, now-warmed dir)', configDirPath);

  console.log('\n=== RESULT ===');
  console.log(`First launch success:  ${first}`);
  console.log(`Second launch success: ${second}`);
  if (!first && second) {
    console.log('CONFIRMED: first-time userData dir init is the bottleneck.');
  } else if (first && second) {
    console.log('Both succeeded - inconclusive, or the earlier failures were transient/unrelated.');
  } else if (!first && !second) {
    console.log('Both failed - not a cold-dir issue specifically; something else is wrong.');
  }
}

main().catch(err => {
  console.error('Diagnostic failed:', err);
  process.exit(1);
});
