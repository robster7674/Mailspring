import { _electron as electron } from 'playwright';
import path from 'path';
import os from 'os';

export interface LaunchOptions {
  configDirPath?: string;
  headless?: boolean;
}

export async function launchElectron(options: LaunchOptions = {}) {
  // resolve from dist directory since this file is compiled
  const projectRoot = path.resolve(__dirname, '../../../');
  const appPath = path.join(projectRoot, 'app');

  const configDirPath = options.configDirPath || path.join(os.homedir(), '.config', 'Mailspring-benchmark');

  const electronApp = await electron.launch({
    executablePath: path.join(projectRoot, 'node_modules/.bin/electron'),
    args: [appPath, '--dev', '--config-dir-path', configDirPath, '--enable-logging'],
  });

  return { electronApp, configDirPath };
}
