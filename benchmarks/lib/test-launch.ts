import { launchElectron } from './launch-electron';
import path from 'path';

export async function testLaunch() {
  console.log('Testing Electron launch...');

  try {
    const { electronApp, configDirPath } = await launchElectron({
      configDirPath: path.join('/tmp', 'mailspring-test-launch'),
    });

    console.log(`✓ Electron app launched`);
    console.log(`  Config dir: ${configDirPath}`);

    const window = await electronApp.firstWindow();
    if (window) {
      console.log(`✓ Main window available`);
      const title = await window.title();
      console.log(`  Window title: ${title}`);
    } else {
      console.log(`✗ No main window found`);
    }

    await electronApp.close();
    console.log('✓ App closed successfully');

    return true;
  } catch (err) {
    console.error('✗ Test failed:', err);
    return false;
  }
}

if (require.main === module) {
  testLaunch().then(success => {
    process.exit(success ? 0 : 1);
  });
}
