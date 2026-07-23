"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runStartupProfileScenario = runStartupProfileScenario;
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const seed_account_1 = require("../fixtures/seed-account");
const child_process_2 = require("child_process");
const fs_1 = __importDefault(require("fs"));
async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function runStartupProfileScenario() {
    const threadCount = 50;
    let gitSha = 'unknown';
    try {
        gitSha = (0, child_process_2.execSync)('git rev-parse --short HEAD', { cwd: path_1.default.resolve(__dirname, '../../') })
            .toString()
            .trim();
    }
    catch (err) { }
    const tempResultsDir = path_1.default.join(__dirname, '../results/temp');
    fs_1.default.mkdirSync(tempResultsDir, { recursive: true });
    console.log(`\n${'='.repeat(70)}`);
    console.log('STARTUP PROFILING - Detailed Timing Breakdown');
    console.log('='.repeat(70));
    console.log(`Threads: ${threadCount}, Git SHA: ${gitSha}\n`);
    const benchmarkDir = path_1.default.join(tempResultsDir, 'startup-profile');
    // Phase 1: Seed database
    console.log('PHASE 1: Database Seeding');
    const seedStart = Date.now();
    await (0, seed_account_1.seedAccount)({
        configDir: benchmarkDir,
        threadCount,
        messagesPerThread: 2,
    });
    const seedTime = Date.now() - seedStart;
    console.log(`✓ Database seeded in ${seedTime}ms\n`);
    // Phase 2: Spawn process and monitor
    console.log('PHASE 2: Process Startup & Initialization');
    const projectRoot = path_1.default.resolve(__dirname, '../../../');
    const electronBinary = path_1.default.join(projectRoot, 'node_modules/.bin/electron');
    const spawnTime = Date.now();
    let firstOutput = 0;
    let processExited = false;
    let exitTime = 0;
    const proc = (0, child_process_1.spawn)(electronBinary, [
        path_1.default.join(projectRoot, 'app'),
        '--enable-logging',
        '--dev',
    ], {
        stdio: 'pipe',
        env: { ...process.env, DISPLAY: ':16.0', PROFILE_STARTUP: '1' },
    });
    console.log(`✓ Process spawned at T+0ms`);
    // Monitor stdout/stderr for activity and print profiling output
    if (proc.stdout) {
        proc.stdout.on('data', (data) => {
            const output = data.toString();
            // Print profiling marks in real-time
            if (output.includes('[PROFILE]')) {
                console.log(output);
            }
            if (firstOutput === 0) {
                firstOutput = Date.now() - spawnTime;
                console.log(`✓ First output at T+${firstOutput}ms`);
            }
        });
    }
    if (proc.stderr) {
        proc.stderr.on('data', (data) => {
            const output = data.toString();
            // Print profiling marks and errors
            if (output.includes('[PROFILE]') || output.includes('Error') || output.includes('error')) {
                console.log(output);
            }
            if (firstOutput === 0) {
                firstOutput = Date.now() - spawnTime;
                console.log(`✓ First stderr output at T+${firstOutput}ms`);
            }
        });
    }
    // Wait for exit or timeout
    await new Promise((resolve) => {
        const timeoutHandle = setTimeout(() => {
            if (!processExited) {
                exitTime = Date.now() - spawnTime;
                console.log(`⚠ Timeout at T+${exitTime}ms (killing process)`);
                proc.kill();
            }
            resolve();
        }, 15000); // Wait up to 15 seconds
        proc.on('exit', (code) => {
            processExited = true;
            exitTime = Date.now() - spawnTime;
            clearTimeout(timeoutHandle);
            console.log(`✓ Process exited at T+${exitTime}ms (code: ${code})`);
            resolve();
        });
        proc.on('error', (err) => {
            clearTimeout(timeoutHandle);
            console.error(`✗ Process error: ${err.message}`);
            resolve();
        });
    });
    console.log('\n' + '='.repeat(70));
    console.log('TIMING SUMMARY');
    console.log('='.repeat(70));
    console.log(`Database Seeding:    ${seedTime}ms`);
    console.log(`Process Spawn:       Instant (T+0ms)`);
    console.log(`First Output:        ${firstOutput > 0 ? `T+${firstOutput}ms` : 'No output'}`);
    console.log(`Process Exit/Timeout: T+${exitTime}ms`);
    console.log(`Total Time:          ${seedTime + exitTime}ms`);
    console.log('='.repeat(70));
    if (exitTime > 5000) {
        console.log(`\n⚠ WARNING: Startup is slow (${exitTime}ms)`);
        console.log('   This suggests an issue with:');
        console.log('   - App initialization code');
        console.log('   - Electron startup on this platform');
        console.log('   - File system or system resource constraints');
    }
    // Save profiling results
    const resultsDir = path_1.default.join(__dirname, '../results');
    const profileResult = {
        timestamp: new Date().toISOString(),
        gitSha,
        threadCount,
        seedTime,
        firstOutput,
        exitTime,
        totalTime: seedTime + exitTime,
        platform: process.platform,
        arch: process.arch,
    };
    fs_1.default.mkdirSync(resultsDir, { recursive: true });
    const filename = path_1.default.join(resultsDir, `profile-${gitSha}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs_1.default.writeFileSync(filename, JSON.stringify(profileResult, null, 2));
    console.log(`\n✓ Profiling results saved to: ${filename}`);
    return {
        timestamp: new Date().toISOString(),
        gitSha,
        runs: 1,
        threadCount,
        median: { duration: exitTime },
        mean: { duration: exitTime },
        min: { duration: exitTime },
        max: { duration: exitTime },
    };
}
if (require.main === module) {
    runStartupProfileScenario()
        .then(() => {
        console.log('\n✓ Startup profiling complete');
        process.exit(0);
    })
        .catch(err => {
        console.error('\n✗ Profiling failed:', err);
        process.exit(1);
    });
}
