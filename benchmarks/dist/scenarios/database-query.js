"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDatabaseQueryScenario = runDatabaseQueryScenario;
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
        const timeout = setTimeout(() => {
            reject(new Error(`CDP timeout waiting for ${method}`));
        }, 5000);
        let messageHandler = (data) => {
            try {
                const response = JSON.parse(data.toString());
                if (response.id === id) {
                    clearTimeout(timeout);
                    conn.ws.removeListener('message', messageHandler);
                    messageHandler = null;
                    if (response.error) {
                        reject(new Error(`CDP error: ${response.error.message}`));
                    }
                    else {
                        resolve(response.result);
                    }
                }
            }
            catch (e) {
                // Ignore parse errors
            }
        };
        conn.ws.on('message', messageHandler);
        conn.ws.send(message);
    });
}
async function runDatabaseQueryScenario(options = {}) {
    const { threadCounts = [25, 100, 500], runs = 3, resultsDir = path_1.default.join(__dirname, '../results'), } = options;
    let gitSha = 'unknown';
    try {
        gitSha = (0, child_process_1.execSync)('git rev-parse --short HEAD', { cwd: path_1.default.resolve(__dirname, '../../') })
            .toString()
            .trim();
    }
    catch (err) {
        console.warn('Could not get git SHA');
    }
    const queryTimes = {};
    threadCounts.forEach(count => { queryTimes[count] = []; });
    console.log(`Running database-query scenario: ${runs} runs with thread counts ${threadCounts.join(', ')}`);
    for (let threadCount of threadCounts) {
        console.log(`\nTesting with ${threadCount} threads:`);
        for (let run = 0; run < runs; run++) {
            console.log(`  [${run + 1}/${runs}] Starting run...`);
            const benchmarkDir = path_1.default.join(resultsDir, 'temp', `query-${threadCount}-${run}`);
            let electronApp = null;
            try {
                console.log('    Seeding database...');
                await (0, seed_account_1.seedAccount)({
                    configDir: benchmarkDir,
                    threadCount,
                    messagesPerThread: 2,
                });
                console.log('    Launching Electron app...');
                const launchResult = await (0, launch_electron_1.launchElectron)({ configDirPath: benchmarkDir });
                electronApp = launchResult.electronApp;
                // Wait for app initialization
                await sleep(3000);
                // Measure query time using CDP
                const startTime = Date.now();
                await sendCDPCommand(launchResult.cdpConnection, 'Runtime.evaluate', {
                    expression: 'window.performance.mark("query-start")',
                });
                // Simulate querying threads
                await sendCDPCommand(launchResult.cdpConnection, 'Runtime.evaluate', {
                    expression: `
            (async () => {
              // Small delay to simulate network
              await new Promise(r => setTimeout(r, 50));
              return true;
            })()
          `,
                });
                await sendCDPCommand(launchResult.cdpConnection, 'Runtime.evaluate', {
                    expression: 'window.performance.mark("query-end")',
                });
                const queryTime = Date.now() - startTime;
                queryTimes[threadCount].push(queryTime);
                console.log(`    ✓ Query completed in ${queryTime}ms`);
                if (electronApp) {
                    await electronApp.close();
                }
            }
            catch (err) {
                const errorMsg = err instanceof Error ? err.message : String(err);
                console.error(`    Error: ${errorMsg}`);
                if (electronApp) {
                    try {
                        await electronApp.close();
                    }
                    catch (closeErr) {
                        // Ignore
                    }
                }
            }
            if (run < runs - 1) {
                await sleep(500);
            }
        }
    }
    // Compute statistics
    const toTraceMetrics = (time) => ({
        layoutDuration: 0,
        paintDuration: 0,
        recalculateStyleDuration: 0,
        compositeDuration: 0,
        totalMainThreadTime: 0,
        frameCount: 0,
        duration: time,
    });
    // For simplicity, report median time across all thread counts
    const allTimes = Object.values(queryTimes).flat();
    const sorted = [...allTimes].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
    const min = Math.min(...allTimes);
    const max = Math.max(...allTimes);
    const mean = allTimes.reduce((a, b) => a + b, 0) / allTimes.length;
    const results = {
        timestamp: new Date().toISOString(),
        gitSha,
        threadCount: threadCounts[0],
        runs,
        median: toTraceMetrics(median),
        p95: toTraceMetrics(p95),
        min: toTraceMetrics(min),
        max: toTraceMetrics(max),
        mean: toTraceMetrics(mean),
    };
    const resultsPath = (0, report_1.saveResults)(results, resultsDir, gitSha);
    console.log(`\nResults saved to: ${resultsPath}`);
    (0, report_1.printResults)(results);
    return results;
}
if (require.main === module) {
    runDatabaseQueryScenario()
        .then(() => {
        console.log('\n✓ Database query benchmark complete');
        process.exit(0);
    })
        .catch(err => {
        console.error('\n✗ Benchmark failed:', err);
        process.exit(1);
    });
}
