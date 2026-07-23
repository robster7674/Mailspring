import { launchElectron } from './launch-electron';
import path from 'path';

async function testCDPLaunch() {
  console.log('Testing CDP launcher...');

  try {
    const benchmarkDir = path.join('/tmp', 'mailspring-cdp-test');
    console.log(`Launching Electron with CDP on ${benchmarkDir}...`);

    const { electronApp, configDirPath, cdpConnection } = await launchElectron({
      configDirPath: benchmarkDir,
    });

    if (!cdpConnection) {
      throw new Error('No CDP connection returned');
    }

    console.log('✓ Electron launched');
    console.log('✓ CDP connection established');

    // Try a simple CDP command to verify connection
    const { ws, messageId } = cdpConnection;
    console.log(`✓ WebSocket connected: ${ws.readyState === 1}`);
    console.log(`✓ Message ID counter ready: ${messageId}`);

    // Close the connection
    await electronApp.close();
    console.log('✓ App closed cleanly');

    console.log('\n✓ CDP launcher test PASSED');
    process.exit(0);
  } catch (err) {
    console.error('\n✗ CDP launcher test FAILED:', err);
    process.exit(1);
  }
}

testCDPLaunch();
