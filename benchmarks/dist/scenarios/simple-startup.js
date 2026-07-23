"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSimpleStartupScenario = runSimpleStartupScenario;
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const seed_account_1 = require("../fixtures/seed-account");
const report_1 = require("../lib/report");
const child_process_2 = require("child_process");
const fs_1 = __importDefault(require("fs"));
async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function runSimpleStartupScenario(options = {}) {
    const { threadCount = 50, runs = 5, resultsDir = path_1.default.join(__dirname, '../results'), } = options;
    let gitSha = 'unknown';
    try {
        gitSha = (0, child_process_2.execSync)('git rev-parse --short HEAD', { cwd: path_1.default.resolve(__dirname, '../../') })
            .toString()
            .trim();
    }
    catch (err) { }
    const startupTimes = [];
    const tempResultsDir = path_1.default.join(resultsDir, 'temp');
    fs_1.default.mkdirSync(tempResultsDir, { recursive: true });
    console.log(`Running simple-startup scenario: ${runs} runs with ${threadCount} threads`);
    console.log('Measuring: Process spawn → app initialization → exit\n');
    for (let run = 0; run < runs; run++) {
        console.log(`[${run + 1}/${runs}] Starting run...`);
        const benchmarkDir = path_1.default.join(tempResultsDir, `startup-${run}`);
        try {
            // Seed database
            console.log('  Seeding database...');
            await (0, seed_account_1.seedAccount)({
                configDir: benchmarkDir,
                threadCount,
                messagesPerThread: 2,
            });
            // Measure time for app to launch and initialize
            console.log('  Launching app...');
            const launchStartTime = Date.now();
            const projectRoot = path_1.default.resolve(__dirname, '../../../');
            const electronBinary = path_1.default.join(projectRoot, 'node_modules/.bin/electron');
            await new Promise((resolve, reject) => {
                const proc = (0, child_process_1.spawn)(electronBinary, [
                    path_1.default.join(projectRoot, 'app'),
                    '--enable-logging',
                    '--dev',
                ], {
                    stdio: 'pipe',
                    env: { ...process.env, DISPLAY: ':16.0' },
                });
                let hasExited = false;
                proc.on('exit', (code) => {
                    hasExited = true;
                    resolve();
                });
                proc.on('error', (err) => {
                    reject(err);
                });
                // Give app 5 seconds to initialize
                setTimeout(() => {
                    if (!hasExited) {
                        proc.kill();
                    }
                }, 5000);
            });
            const startupTime = Date.now() - launchStartTime;
            startupTimes.push(startupTime);
            console.log(`  ✓ App lifecycle completed in ${startupTime}ms`);
        }
        catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error(`  Error in run ${run + 1}:`, errorMsg);
            throw err;
        }
        // Delay between runs
        if (run < runs - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    // Compute statistics
    const sorted = [...startupTimes].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
    const min = Math.min(...startupTimes);
    const max = Math.max(...startupTimes);
    const mean = startupTimes.reduce((a, b) => a + b, 0) / startupTimes.length;
    const toTraceMetrics = (time) => ({
        layoutDuration: 0,
        paintDuration: 0,
        recalculateStyleDuration: 0,
        compositeDuration: 0,
        totalMainThreadTime: 0,
        frameCount: 0,
        duration: time,
    });
    const results = {
        timestamp: new Date().toISOString(),
        gitSha,
        threadCount,
        runs,
        median: toTraceMetrics(median),
        p95: toTraceMetrics(p95),
        min: toTraceMetrics(min),
        max: toTraceMetrics(max),
        mean: toTraceMetrics(mean),
    };
    const resultsPath = (0, report_1.saveResults)(results, resultsDir, gitSha);
    console.log(`\nResults saved to: ${resultsPath}`);
    // Print detailed summary
    console.log('\n' + '='.repeat(70));
    console.log('APP STARTUP TIME (BASELINE)');
    console.log('='.repeat(70));
    console.log(`Runs:        ${runs}`);
    console.log(`Threads:     ${threadCount}`);
    console.log(`Git SHA:     ${gitSha}`);
    console.log('-'.repeat(70));
    console.log(`Median:      ${median}ms`);
    console.log(`P95:         ${p95}ms`);
    console.log(`Min:         ${min}ms`);
    console.log(`Max:         ${max}ms`);
    console.log(`Mean:        ${mean.toFixed(2)}ms`);
    console.log(`Std Dev:     ${Math.sqrt(startupTimes.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / startupTimes.length).toFixed(2)}ms`);
    console.log('='.repeat(70));
    console.log(`Raw times:   ${startupTimes.map(t => t + 'ms').join(', ')}`);
    console.log('='.repeat(70));
    (0, report_1.printResults)(results);
    return results;
}
if (require.main === module) {
    runSimpleStartupScenario()
        .then(() => {
        console.log('\n✓ Simple startup benchmark complete');
        process.exit(0);
    })
        .catch(err => {
        console.error('\n✗ Benchmark failed:', err);
        process.exit(1);
    });
}
