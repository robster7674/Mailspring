import { _electron as electron } from 'playwright';
import path from 'path';
import os from 'os';
import fs from 'fs';

export interface LaunchOptions {
  configDirPath?: string;
  headless?: boolean;
}

export async function launchElectron(options: LaunchOptions = {}) {
  // resolve from dist directory since this file is compiled
  const projectRoot = path.resolve(__dirname, '../../../');

  const configDirPath = options.configDirPath || path.join(os.homedir(), '.config', 'Mailspring-benchmark');

  // The built binary is the most reliable way to run Mailspring
  const builtBinaryPath = path.join(projectRoot, 'app/dist/mailspring-linux-x64/mailspring');

  if (!fs.existsSync(builtBinaryPath)) {
    throw new Error(
      `Mailspring built binary not found at ${builtBinaryPath}. ` +
      `Please run 'npm run build' to build the application.`
    );
  }

  // Set environment variables for the app
  const env = {
    ...process.env,
    // Tell Mailspring to use our benchmark config directory
    MAILSPRING_CONFIG_DIR: configDirPath,
  };

  const electronApp = await electron.launch({
    executablePath: builtBinaryPath,
    env,
    // Allow the Mailspring app to run in the background without requiring a display
    args: [],
  });

  return { electronApp, configDirPath };
}
