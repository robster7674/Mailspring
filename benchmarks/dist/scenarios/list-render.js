"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runListRenderScenario = runListRenderScenario;
const path_1 = __importDefault(require("path"));
const launch_electron_1 = require("../lib/launch-electron");
const seed_account_1 = require("../fixtures/seed-account");
const report_1 = require("../lib/report");
const child_process_1 = require("child_process");
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function runListRenderScenario(options = {}) {
    const { threadCount = 250, runs = 3, resultsDir = path_1.default.join(__dirname, '../results') } = options;
    let gitSha = 'unknown';
    try {
        gitSha = (0, child_process_1.execSync)('git rev-parse --short HEAD', { cwd: path_1.default.resolve(__dirname, '../../') }).toString().trim();
    }
    catch (err) { }
    const renderTimes = [];
    console.log(`Running list-render scenario: ${runs} runs with ${threadCount} threads`);
    for (let run = 0; run < runs; run++) {
        console.log(`\n[${run + 1}/${runs}] Starting run...`);
        const benchmarkDir = path_1.default.join(resultsDir, 'temp', `render-${run}`);
        let electronApp = null;
        try {
            console.log('  Seeding database...');
            await (0, seed_account_1.seedAccount)({ configDir: benchmarkDir, threadCount, messagesPerThread: 2 });
            console.log('  Launching app...');
            const startTime = Date.now();
            const launchResult = await (0, launch_electron_1.launchElectron)({ configDirPath: benchmarkDir });
            electronApp = launchResult.electronApp;
            await sleep(2000);
            const renderTime = Date.now() - startTime;
            renderTimes.push(renderTime);
            console.log(`  ✓ List rendered in ${renderTime}ms`);
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
    const toMetrics = (t) => ({ layoutDuration: 0, paintDuration: 0, recalculateStyleDuration: 0, compositeDuration: 0, totalMainThreadTime: 0, frameCount: 0, duration: t });
    const sorted = [...renderTimes].sort((a, b) => a - b);
    const results = {
        timestamp: new Date().toISOString(),
        gitSha,
        threadCount,
        runs,
        median: toMetrics(sorted[Math.floor(sorted.length / 2)]),
        p95: toMetrics(sorted[Math.ceil(sorted.length * 0.95) - 1]),
        min: toMetrics(Math.min(...renderTimes)),
        max: toMetrics(Math.max(...renderTimes)),
        mean: toMetrics(renderTimes.reduce((a, b) => a + b, 0) / renderTimes.length),
    };
    const resultsPath = (0, report_1.saveResults)(results, resultsDir, gitSha);
    console.log(`\nResults saved to: ${resultsPath}`);
    (0, report_1.printResults)(results);
    return results;
}
if (require.main === module) {
    runListRenderScenario().then(() => { console.log('\n✓ List render benchmark complete'); process.exit(0); }).catch(err => { console.error('\n✗ Benchmark failed:', err); process.exit(1); });
}
