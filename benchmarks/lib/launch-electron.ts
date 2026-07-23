import path from 'path';
import os from 'os';
import fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import http from 'http';
import WebSocket from 'ws';

export interface LaunchOptions {
  configDirPath?: string;
  headless?: boolean;
}

interface CDPConnection {
  ws: WebSocket;
  messageId: number;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getDebuggerUrl(port: number = 9222, timeoutMs: number = 30000): Promise<string> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await new Promise<string>((resolve, reject) => {
        const req = http.get(`http://localhost:${port}/json/list`, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve(data));
        });
        req.on('error', (err: any) => reject(err));
        req.setTimeout(2000);
      });

      const pages = JSON.parse(response);
      if (pages.length > 0 && pages[0].webSocketDebuggerUrl) {
        console.log(`✓ Debugger endpoint found after ${Date.now() - startTime}ms`);
        return pages[0].webSocketDebuggerUrl;
      }
    } catch (err: any) {
      // Not ready yet
    }

    await sleep(500);
  }

  throw new Error(`Debugger endpoint not found after ${timeoutMs}ms`);
}

async function connectCDP(debuggerUrl: string): Promise<CDPConnection> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(debuggerUrl);

    ws.on('open', () => {
      console.log('✓ CDP connection established');
      resolve({ ws, messageId: 1 });
    });

    ws.on('error', (err) => {
      reject(new Error(`CDP connection failed: ${err.message}`));
    });
  });
}

async function sendCDPCommand(conn: CDPConnection, method: string, params: any = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = conn.messageId++;
    const message = JSON.stringify({ id, method, params });

    const messageHandler = (data: string) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.id === id) {
          conn.ws.off('message', messageHandler);
          if (response.error) {
            reject(new Error(`CDP error: ${response.error.message}`));
          } else {
            resolve(response.result);
          }
        }
      } catch (e) {
        // Ignore parse errors, wait for the actual response
      }
    };

    conn.ws.on('message', messageHandler);
    conn.ws.send(message);
  });
}

export async function launchElectron(options: LaunchOptions = {}): Promise<{ electronApp: any; configDirPath: string; cdpConnection?: CDPConnection }> {
  const projectRoot = path.resolve(__dirname, '../../../');
  const appPath = path.join(projectRoot, 'app');
  const configDirPath = options.configDirPath || path.join(os.homedir(), '.config', 'Mailspring-benchmark');
  const cdpPort = 9222;

  const electronBinary = path.join(projectRoot, 'node_modules/.bin/electron');

  if (!fs.existsSync(electronBinary)) {
    throw new Error(`Electron binary not found. Please run 'npm install'.`);
  }

  // Ensure config directory exists
  fs.mkdirSync(configDirPath, { recursive: true });

  console.log(`Launching Electron with CDP on port ${cdpPort}...`);

  const electronProcess = spawn(electronBinary, [
    appPath,
    '--enable-logging',
    '--dev',
    `--remote-debugging-port=${cdpPort}`,
  ], {
    stdio: 'pipe',
    env: { ...process.env, MAILSPRING_CONFIG_DIR: configDirPath },
  });

  let processExited = false;
  electronProcess.on('exit', (code) => {
    processExited = true;
    console.warn(`Electron process exited with code ${code}`);
  });

  // Wait for debugger to become available
  let debuggerUrl: string;
  try {
    debuggerUrl = await getDebuggerUrl(cdpPort);
  } catch (err: any) {
    electronProcess.kill();
    throw new Error(`Failed to launch Electron: ${err?.message || String(err)}`);
  }

  // Connect to CDP
  let cdpConnection: CDPConnection;
  try {
    cdpConnection = await connectCDP(debuggerUrl);
  } catch (err) {
    electronProcess.kill();
    throw err;
  }

  // Create a wrapper that mimics Playwright's API but uses raw CDP
  const electronApp = {
    close: async () => {
      cdpConnection.ws.close();
      electronProcess.kill();
    },
    getCDPSession: () => cdpConnection,
  };

  return { electronApp, configDirPath, cdpConnection };
}
