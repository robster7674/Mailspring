import { _electron as electron } from 'playwright';
import path from 'path';
import os from 'os';
import fs from 'fs';

export interface LaunchOptions {
  configDirPath?: string;
  headless?: boolean;
}

export async function launchElectron(options: LaunchOptions = {}) {
  const projectRoot = path.resolve(__dirname, '../../../');
  const appPath = path.join(projectRoot, 'app');
  const configDirPath = options.configDirPath || path.join(os.homedir(), '.config', 'Mailspring-benchmark');

  const electronBinary = path.join(projectRoot, 'node_modules/.bin/electron');

  if (!fs.existsSync(electronBinary)) {
    throw new Error(`Electron binary not found. Please run 'npm install'.`);
  }

  // Now that the app initialization is fixed, use Playwright's standard Electron launcher
  const electronApp = await electron.launch({
    executablePath: electronBinary,
    args: [appPath, '--dev', '--config-dir-path', configDirPath, '--enable-logging'],
  });

  return { electronApp, configDirPath };
}
