import path from 'path';
import os from 'os';
import fs from 'fs';
import { _electron as electron, ElectronApplication } from 'playwright';

export interface LaunchOptions {
  configDirPath?: string;
}

// Linux-only workarounds for a namespace-restricted-container failure mode
// found while building this harness (child process spawns, never
// establishes its IPC connection - see git history of
// benchmarks/spikes/phase0-spike.ts and .github/workflows/perf-trace.yaml).
// Not needed/relevant on macOS or a real desktop; CI now runs on
// macos-latest instead, where none of this is required.
const linuxOnlyArgs =
  process.platform === 'linux'
    ? ['--no-sandbox', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage', '--disable-software-rasterizer']
    : [];

export async function launchElectron(
  options: LaunchOptions = {}
): Promise<{ electronApp: ElectronApplication; configDirPath: string }> {
  const projectRoot = path.resolve(__dirname, '../../../');
  const appPath = path.join(projectRoot, 'app');
  const configDirPath = options.configDirPath || path.join(os.tmpdir(), 'mailspring-benchmark');
  fs.mkdirSync(configDirPath, { recursive: true });

  const electronApp = await electron.launch({
    // Without this, Playwright downloads/uses its own default Electron
    // build instead of this repo's pinned node_modules/electron.
    executablePath: require('electron') as unknown as string,
    args: [appPath, '--enable-logging', '--dev', ...linuxOnlyArgs],
    env: { ...process.env, MAILSPRING_CONFIG_DIR: configDirPath } as any,
    timeout: 60000,
  });

  // Benchmark scenarios seed data straight into SQLite (fixtures/seed-account.ts),
  // bypassing the sync engine, so mailsync.migrate() succeeding isn't actually
  // required for what these scenarios measure. But if it fails for any reason
  // (missing/broken mailsync binary), application.ts shows a *synchronous*
  // dialog.showMessageBoxSync() waiting for a button click that will never
  // come headlessly - hanging the whole run with no further output. Patch it
  // to auto-dismiss, same as playwright/helpers.ts's proven launchApp() does.
  try {
    await electronApp.evaluate(({ dialog }) => {
      dialog.showMessageBoxSync = () => 0;
      dialog.showMessageBox = () => Promise.resolve({ response: 0, checkboxChecked: false } as any);
      dialog.showErrorBox = () => {};
    });
  } catch {
    // Main process context not available yet - proceed without the patch.
  }

  return { electronApp, configDirPath };
}
