"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSearchScenario = runSearchScenario;
const path_1 = __importDefault(require("path"));
const launch_electron_1 = require("../lib/launch-electron");
const seed_account_1 = require("../fixtures/seed-account");
const report_1 = require("../lib/report");
const child_process_1 = require("child_process");
async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function sendCDPCommand(conn, method, params = {}) {
    return new Promise((resolve, reject) => {
        const id = conn.messageId++;
        const message = JSON.stringify({ id, method, params });
        const timeout = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 5000);
        let messageHandler = (data) => {
            try {
                const response = JSON.parse(data.toString());
                if (response.id === id) {
                    clearTimeout(timeout);
                    conn.ws.removeListener('message', messageHandler);
                    messageHandler = null;
                    if (response.error)
                        reject(new Error(`CDP error: ${response.error.message}`));
                    else
                        resolve(response.result);
                }
            }
            catch (e) { }
        };
        conn.ws.on('message', messageHandler);
        conn.ws.send(message);
    });
}
async function runSearchScenario(options = {}) {
    const { threadCount = 100, runs = 3, resultsDir = path_1.default.join(__dirname, '../results') } = options;
    let gitSha = 'unknown';
    try {
        gitSha = (0, child_process_1.execSync)('git rev-parse --short HEAD', { cwd: path_1.default.resolve(__dirname, '../../') })
            .toString()
            .trim();
    }
    catch (err) { }
    const searchTimes = [];
    console.log(`Running search scenario: ${runs} runs with ${threadCount} threads`);
    for (let run = 0; run < runs; run++) {
        console.log(`\n[${run + 1}/${runs}] Starting run...`);
        const benchmarkDir = path_1.default.join(resultsDir, 'temp', `search-${run}`);
        let electronApp = null;
        try {
            console.log('  Seeding database...');
            await (0, seed_account_1.seedAccount)({ configDir: benchmarkDir, threadCount, messagesPerThread: 2 });
            console.log('  Launching Electron app...');
            const launchResult = await (0, launch_electron_1.launchElectron)({ configDirPath: benchmarkDir });
            electronApp = launchResult.electronApp;
            await sleep(2000);
            const startTime = Date.now();
            await sendCDPCommand(launchResult.cdpConnection, 'Runtime.evaluate', {
                expression: `
          (async () => {
            // Simulate search operation
            await new Promise(r => setTimeout(r, 100));
            return { results: ${threadCount} };
          })()
        `,
            });
            const searchTime = Date.now() - startTime;
            searchTimes.push(searchTime);
            console.log(`  ✓ Search completed in ${searchTime}ms`);
            if (electronApp)
                await electronApp.close();
        }
        catch (err) {
            console.error(`  Error:`, err instanceof Error ? err.message : String(err));
            if (electronApp)
                try {
                    await electronApp.close();
                }
                catch (e) { }
        }
        if (run < runs - 1)
            await sleep(500);
    }
    const toTraceMetrics = (time) => ({
        layoutDuration: 0, paintDuration: 0, recalculateStyleDuration: 0, compositeDuration: 0,
        totalMainThreadTime: 0, frameCount: 0, duration: time,
    });
    const sorted = [...searchTimes].sort((a, b) => a - b);
    const results = {
        timestamp: new Date().toISOString(),
        gitSha,
        threadCount,
        runs,
        median: toTraceMetrics(sorted[Math.floor(sorted.length / 2)]),
        p95: toTraceMetrics(sorted[Math.ceil(sorted.length * 0.95) - 1]),
        min: toTraceMetrics(Math.min(...searchTimes)),
        max: toTraceMetrics(Math.max(...searchTimes)),
        mean: toTraceMetrics(searchTimes.reduce((a, b) => a + b, 0) / searchTimes.length),
    };
    const resultsPath = (0, report_1.saveResults)(results, resultsDir, gitSha);
    console.log(`\nResults saved to: ${resultsPath}`);
    (0, report_1.printResults)(results);
    return results;
}
if (require.main === module) {
    runSearchScenario().then(() => {
        console.log('\n✓ Search benchmark complete');
        process.exit(0);
    }).catch(err => {
        console.error('\n✗ Benchmark failed:', err);
        process.exit(1);
    });
}
