import path from 'path';
import { spawn } from 'child_process';
import { seedAccount } from '../fixtures/seed-account';
import { execSync } from 'child_process';
import fs from 'fs';

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function runStartupProfileScenario() {
  const threadCount = 50;
  let gitSha = 'unknown';
  try {
    gitSha = execSync('git rev-parse --short HEAD', { cwd: path.resolve(__dirname, '../../') })
      .toString()
      .trim();
  } catch (err) {}

  const tempResultsDir = path.join(__dirname, '../results/temp');
  fs.mkdirSync(tempResultsDir, { recursive: true });

  console.log(`\n${'='.repeat(70)}`);
  console.log('STARTUP PROFILING - Detailed Timing Breakdown');
  console.log('='.repeat(70));
  console.log(`Threads: ${threadCount}, Git SHA: ${gitSha}\n`);

  const benchmarkDir = path.join(tempResultsDir, 'startup-profile');

  // Phase 1: Seed database
  console.log('PHASE 1: Database Seeding');
  const seedStart = Date.now();
  await seedAccount({
    configDir: benchmarkDir,
    threadCount,
    messagesPerThread: 2,
  });
  const seedTime = Date.now() - seedStart;
  console.log(`✓ Database seeded in ${seedTime}ms\n`);

  // Phase 2: Spawn process and monitor
  console.log('PHASE 2: Process Startup & Initialization');
  const projectRoot = path.resolve(__dirname, '../../../');
  const electronBinary = path.join(projectRoot, 'node_modules/.bin/electron');

  const spawnTime = Date.now();
  let firstOutput = 0;
  let processExited = false;
  let exitTime = 0;

  const proc = spawn(electronBinary, [
    path.join(projectRoot, 'app'),
    '--enable-logging',
    '--dev',
  ], {
    stdio: 'pipe',
    env: { ...process.env, DISPLAY: ':16.0' },
  });

  console.log(`✓ Process spawned at T+0ms`);

  // Monitor stdout/stderr for activity
  if (proc.stdout) {
    proc.stdout.on('data', (data) => {
      if (firstOutput === 0) {
        firstOutput = Date.now() - spawnTime;
        console.log(`✓ First output at T+${firstOutput}ms`);
      }
    });
  }

  if (proc.stderr) {
    proc.stderr.on('data', (data) => {
      if (firstOutput === 0) {
        firstOutput = Date.now() - spawnTime;
        console.log(`✓ First stderr output at T+${firstOutput}ms`);
      }
    });
  }

  // Wait for exit or timeout
  await new Promise<void>((resolve) => {
    const timeoutHandle = setTimeout(() => {
      if (!processExited) {
        exitTime = Date.now() - spawnTime;
        console.log(`⚠ Timeout at T+${exitTime}ms (killing process)`);
        proc.kill();
      }
      resolve();
    }, 10000); // Wait up to 10 seconds

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
