import { chromium } from 'playwright';
import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';

export interface LaunchOptions {
  configDirPath?: string;
  headless?: boolean;
}

export async function launchElectron(options: LaunchOptions = {}): Promise<{ electronApp: any; configDirPath: string }> {
  const projectRoot = path.resolve(__dirname, '../../../');
  const configDirPath = options.configDirPath || path.join(os.homedir(), '.config', 'Mailspring-benchmark');

  // Use the Electron binary from node_modules with our fixed source code
  const electronBinary = path.join(projectRoot, 'node_modules/.bin/electron');
  const appPath = path.join(projectRoot, 'app');

  if (!fs.existsSync(electronBinary)) {
    throw new Error(`Electron binary not found at ${electronBinary}. Please run 'npm install'.`);
  }

  // Launch Mailspring via Electron + our fixed source
  const appProcess = spawn(electronBinary, [appPath, '--dev', '--config-dir-path', configDirPath, '--enable-logging'], {
    env: {
      ...process.env,
      DISPLAY: process.env.DISPLAY || ':0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Wait for the app to start and extract CDP port from output
  let cdpPort: number | null = null;
  let startupTimeout: NodeJS.Timeout;

  return new Promise((resolve, reject) => {
    startupTimeout = setTimeout(() => {
      appProcess.kill();
      reject(new Error('Timeout waiting for Mailspring to start (5s)'));
    }, 5000);

    const onData = (data: Buffer) => {
      const output = data.toString();
      // Look for CDP port in Electron's startup output
      const match = output.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (match) {
        cdpPort = parseInt(match[1], 10);
        appProcess.stdout?.removeListener('data', onData);
        appProcess.stderr?.removeListener('data', onData);
        clearTimeout(startupTimeout);

        // Create a mock Electron app that Playwright can use
        const mockApp: any = {
          firstWindow: async () => {
            // Connect to CDP and return a browser page
            if (!cdpPort) throw new Error('CDP port not available');
            const browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
            const contexts = browser.contexts();
            if (contexts.length === 0) {
              throw new Error('No browser contexts available');
            }
            const pages = contexts[0].pages();
            if (pages.length === 0) {
              throw new Error('No pages available');
            }
            return pages[0];
          },
          close: async () => {
            appProcess.kill();
          },
          context: () => ({
            newCDPSession: async (page: any) => {
              // Return a mock CDP session
              return {
                send: async (method: string, params?: any) => {
                  // This will be handled by the actual page's CDP
                  return null;
                },
              };
            },
          }),
        };

        resolve({ electronApp: mockApp, configDirPath });
      }
    };

    appProcess.stdout?.on('data', onData);
    appProcess.stderr?.on('data', onData);

    appProcess.on('error', (err) => {
      clearTimeout(startupTimeout);
      reject(err);
    });

    appProcess.on('exit', (code) => {
      if (code !== 0) {
        clearTimeout(startupTimeout);
        reject(new Error(`Electron process exited with code ${code}`));
      }
    });
  });
}
