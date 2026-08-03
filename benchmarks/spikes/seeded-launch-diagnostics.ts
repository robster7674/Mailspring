/**
 * Throwaway diagnostic for the Phase 1 launch hang (folder-navigation.ts /
 * archive-message.ts / send-message.ts all failed identically: process
 * alive, silent, electron.launch() timeout).
 *
 * Unlike userdata-warmup-test.ts (which ruled out cold-vs-warm userData
 * dirs), this seeds an account via fixtures/seed-account.ts - the same
 * seeding every failing scenario does - and uses the same CDP window-
 * detection technique that root-caused the earlier macOS silent-hang
 * (app.on('window', ...), polled BrowserWindow.getAllWindows() via
 * app.evaluate(), and drained stdout/stderr - see launch-electron.ts,
 * just fixed to drain those streams instead of leaving them unread).
 *
 * Delete this file once the launch hang is resolved.
 */
import path from 'path';
import os from 'os';
import fs from 'fs';
import { _electron as electron, ElectronApplication } from 'playwright';
import { seedAccount } from '../fixtures/seed-account';

async function main() {
  const projectRoot = path.resolve(__dirname, '../../../');
  const appPath = path.join(projectRoot, 'app');
  const configDirPath = path.join(os.tmpdir(), 'mailspring-seeded-launch-diagnostics');

  console.log('Seeding account...');
  await seedAccount({ configDir: configDirPath, threadCount: 10, messagesPerThread: 2 });

  const linuxOnlyArgs =
    process.platform === 'linux'
      ? ['--no-sandbox', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage', '--disable-software-rasterizer']
      : [];

  console.log('Launching Electron via Playwright against the seeded config dir...');
  let app: ElectronApplication;
  try {
    app = await electron.launch({
      executablePath: require('electron') as unknown as string,
      timeout: 90000,
      args: [appPath, '--enable-logging', '--dev', '--config-dir-path', configDirPath, ...linuxOnlyArgs],
      env: { ...process.env } as any,
    });
  } catch (err) {
    console.log('electron.launch() itself threw/timed out:', err instanceof Error ? err.message : err);
    console.log('\n=== RESULT ===');
    console.log('electron.launch() never resolved - cannot proceed to window diagnostics.');
    process.exit(1);
  }

  const proc = app.process();
  console.log(`App process pid=${proc.pid}`);
  proc.stdout?.on('data', (d: Buffer) => process.stdout.write(`[app stdout] ${d}`));
  proc.stderr?.on('data', (d: Buffer) => process.stderr.write(`[app stderr] ${d}`));
  proc.on('exit', (code, signal) => console.log(`App process exited: code=${code} signal=${signal}`));

  app.on('window', async page => {
    console.log(`[CDP] 'window' event fired: url=${page.url()}`);
  });

  const start = Date.now();
  const pollInterval = setInterval(async () => {
    console.log(
      `Still waiting after ${Date.now() - start}ms (process alive: ${proc.exitCode === null}, ` +
        `app.windows().length=${app.windows().length})`
    );
    try {
      const info = await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().map(w => ({
          id: w.id,
          isVisible: (() => {
            try {
              return w.isVisible();
            } catch {
              return '(error)';
            }
          })(),
        }))
      );
      console.log(`  BrowserWindow.getAllWindows() via CDP eval: ${JSON.stringify(info)}`);
    } catch (err) {
      console.log(`  BrowserWindow.getAllWindows() via CDP eval FAILED: ${err instanceof Error ? err.message : err}`);
    }
  }, 10000);

  let window;
  let firstWindowError: unknown = null;
  try {
    window = await app.firstWindow({ timeout: 60000 });
  } catch (err) {
    firstWindowError = err;
  } finally {
    clearInterval(pollInterval);
  }

  console.log('\n=== RESULT ===');
  if (window) {
    console.log(`SUCCESS: got first window after ${Date.now() - start}ms, title=${await window.title().catch(() => '(none)')}`);
    console.log('The stdout/stderr drain fix in launch-electron.ts resolved the hang.');
  } else {
    console.log(`FAILED: firstWindow() never resolved - ${firstWindowError instanceof Error ? firstWindowError.message : firstWindowError}`);
    console.log('The drain fix alone was not sufficient; see the polled diagnostics above for what the app was actually doing.');
  }

  await app.close().catch(() => {});
  process.exit(window ? 0 : 1);
}

main().catch(err => {
  console.error('Diagnostic failed:', err);
  process.exit(1);
});
