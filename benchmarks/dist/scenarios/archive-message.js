"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runArchiveScenario = runArchiveScenario;
const path_1 = __importDefault(require("path"));
const launch_electron_1 = require("../lib/launch-electron");
const seed_account_1 = require("../fixtures/seed-account");
const trace_capture_1 = require("../lib/trace-capture");
const trace_parse_1 = require("../lib/trace-parse");
const report_1 = require("../lib/report");
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
async function waitForThreadListPopulated(window, timeout = 30000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        try {
            // Look for thread items with data-item-id attribute (set in thread-list-props)
            const threadItems = await window.$$('[data-item-id]');
            if (threadItems.length > 0) {
                return;
            }
        }
        catch (err) {
            // Selector might not exist yet
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Thread list did not populate within timeout');
}
async function runArchiveScenario(options = {}) {
    const { threadCount = 25, messagesPerThread = 2, runs = 3, resultsDir = path_1.default.join(__dirname, '../results'), headless = true, } = options;
    // Get current git SHA
    let gitSha = 'unknown';
    try {
        gitSha = (0, child_process_1.execSync)('git rev-parse --short HEAD', { cwd: path_1.default.resolve(__dirname, '../../') })
            .toString()
            .trim();
    }
    catch (err) {
        console.warn('Could not get git SHA');
    }
    const allMetrics = [];
    const tempResultsDir = path_1.default.join(resultsDir, 'temp');
    fs_1.default.mkdirSync(tempResultsDir, { recursive: true });
    console.log(`Running archive-message scenario: ${runs} runs with ${threadCount} threads`);
    console.log(`Headless: ${headless}`);
    for (let run = 0; run < runs; run++) {
        console.log(`\n[${run + 1}/${runs}] Starting run...`);
        // Fresh config dir for each run to avoid state carryover
        const benchmarkDir = path_1.default.join(tempResultsDir, `run-${run}`);
        let electronApp = null;
        try {
            // Seed the database
            console.log('  Seeding database...');
            await (0, seed_account_1.seedAccount)({
                configDir: benchmarkDir,
                threadCount,
                messagesPerThread,
            });
            // Launch Electron
            console.log('  Launching Electron app...');
            const launchResult = await (0, launch_electron_1.launchElectron)({
                configDirPath: benchmarkDir,
            });
            electronApp = launchResult.electronApp;
            const window = await electronApp.firstWindow();
            if (!window) {
                throw new Error('No main window available');
            }
            // Wait for thread list to be visible and populated
            console.log('  Waiting for thread list to load...');
            await waitForThreadListPopulated(window);
            // Give UI a moment to settle after populating
            await window.waitForTimeout(1000);
            // Start CDP tracing
            console.log('  Starting trace capture...');
            const traceFile = path_1.default.join(tempResultsDir, `trace-${run}.json`);
            const cdpSession = await (0, trace_capture_1.startTracing)(electronApp, window, { outputDir: tempResultsDir });
            try {
                // Find first thread item
                const threadItems = await window.$$('[data-item-id]');
                if (threadItems.length === 0) {
                    throw new Error('No thread items found after wait');
                }
                console.log(`  Found ${threadItems.length} threads in list`);
                // Click the first thread to open message view
                console.log('  Opening first thread...');
                await threadItems[0].click();
                await window.waitForTimeout(500);
                // Look for archive button/action
                // In list view, might need to trigger via right-click menu or keyboard
                console.log('  Triggering archive action...');
                // Try keyboard shortcut 'a' for archive
                await window.keyboard.press('a');
                // Wait for animation to complete (120ms base animation + safety buffer)
                await window.waitForTimeout(500);
            }
            finally {
                // Stop tracing
                console.log('  Stopping trace capture...');
                await (0, trace_capture_1.stopTracing)(cdpSession, traceFile);
                // Parse trace
                try {
                    const metrics = (0, trace_parse_1.parseTrace)(traceFile);
                    allMetrics.push(metrics);
                    console.log(`  Results: Layout=${metrics.layoutDuration.toFixed(2)}ms Paint=${metrics.paintDuration.toFixed(2)}ms CompositeTime=${metrics.compositeDuration.toFixed(2)}ms`);
                }
                catch (parseErr) {
                    console.error('  Failed to parse trace:', parseErr);
                    throw parseErr;
                }
            }
            // Close app
            if (electronApp) {
                await electronApp.close();
            }
        }
        catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error(`  Error in run ${run + 1}:`, errorMsg);
            if (electronApp) {
                try {
                    await electronApp.close();
                }
                catch (closeErr) {
                    // Ignore close errors
                }
            }
            throw err;
        }
        // Small delay between runs
        if (run < runs - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    // Aggregate results
    if (allMetrics.length === 0) {
        throw new Error('No metrics collected');
    }
    const aggregated = (0, trace_parse_1.aggregateMetrics)(allMetrics);
    const results = {
        timestamp: new Date().toISOString(),
        gitSha,
        threadCount,
        runs,
        median: aggregated.median,
        p95: aggregated.p95,
        min: aggregated.min,
        max: aggregated.max,
        mean: aggregated.mean,
    };
    // Save results
    const resultsPath = (0, report_1.saveResults)(results, resultsDir, gitSha);
    console.log(`\nResults saved to: ${resultsPath}`);
    // Print results
    (0, report_1.printResults)(results);
    return results;
}
if (require.main === module) {
    runArchiveScenario()
        .then(() => {
        console.log('\n✓ Benchmark complete');
        process.exit(0);
    })
        .catch(err => {
        console.error('\n✗ Benchmark failed:', err);
        process.exit(1);
    });
}
