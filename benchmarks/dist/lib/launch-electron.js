"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.launchElectron = launchElectron;
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const fs_1 = __importDefault(require("fs"));
const child_process_1 = require("child_process");
const http_1 = __importDefault(require("http"));
const ws_1 = __importDefault(require("ws"));
async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function getDebuggerUrl(port = 9222, timeoutMs = 60000) {
    const startTime = Date.now();
    let lastError = null;
    while (Date.now() - startTime < timeoutMs) {
        try {
            const response = await new Promise((resolve, reject) => {
                const req = http_1.default.get(`http://localhost:${port}/json/list`, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => resolve(data));
                });
                req.on('error', (err) => reject(err));
                req.setTimeout(2000);
            });
            const pages = JSON.parse(response);
            if (pages.length > 0 && pages[0].webSocketDebuggerUrl) {
                console.log(`✓ Debugger endpoint found after ${Date.now() - startTime}ms`);
                return pages[0].webSocketDebuggerUrl;
            }
        }
        catch (err) {
            lastError = err;
            // Not ready yet
        }
        await sleep(500);
    }
    throw new Error(`Debugger endpoint not found after ${timeoutMs}ms. Last error: ${lastError?.message || 'unknown'}`);
}
async function connectCDP(debuggerUrl) {
    return new Promise((resolve, reject) => {
        const ws = new ws_1.default(debuggerUrl);
        ws.on('open', () => {
            console.log('✓ CDP connection established');
            resolve({ ws, messageId: 1 });
        });
        ws.on('error', (err) => {
            reject(new Error(`CDP connection failed: ${err.message}`));
        });
    });
}
async function sendCDPCommand(conn, method, params = {}) {
    return new Promise((resolve, reject) => {
        const id = conn.messageId++;
        const message = JSON.stringify({ id, method, params });
        const messageHandler = (data) => {
            try {
                const response = JSON.parse(data.toString());
                if (response.id === id) {
                    conn.ws.off('message', messageHandler);
                    if (response.error) {
                        reject(new Error(`CDP error: ${response.error.message}`));
                    }
                    else {
                        resolve(response.result);
                    }
                }
            }
            catch (e) {
                // Ignore parse errors, wait for the actual response
            }
        };
        conn.ws.on('message', messageHandler);
        conn.ws.send(message);
    });
}
async function launchElectron(options = {}) {
    const projectRoot = path_1.default.resolve(__dirname, '../../../');
    const appPath = path_1.default.join(projectRoot, 'app');
    const configDirPath = options.configDirPath || path_1.default.join(os_1.default.homedir(), '.config', 'Mailspring-benchmark');
    const cdpPort = 9222;
    const electronBinary = path_1.default.join(projectRoot, 'node_modules/.bin/electron');
    if (!fs_1.default.existsSync(electronBinary)) {
        throw new Error(`Electron binary not found. Please run 'npm install'.`);
    }
    // Ensure config directory exists
    fs_1.default.mkdirSync(configDirPath, { recursive: true });
    console.log(`Launching Electron with CDP on port ${cdpPort}...`);
    const electronProcess = (0, child_process_1.spawn)(electronBinary, [
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
    let debuggerUrl;
    try {
        debuggerUrl = await getDebuggerUrl(cdpPort);
    }
    catch (err) {
        electronProcess.kill();
        throw new Error(`Failed to launch Electron: ${err?.message || String(err)}`);
    }
    // Connect to CDP
    let cdpConnection;
    try {
        cdpConnection = await connectCDP(debuggerUrl);
    }
    catch (err) {
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
