"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.testLaunch = testLaunch;
const launch_electron_1 = require("./launch-electron");
const path_1 = __importDefault(require("path"));
async function testLaunch() {
    console.log('Testing Electron launch...');
    try {
        const { electronApp, configDirPath } = await (0, launch_electron_1.launchElectron)({
            configDirPath: path_1.default.join('/tmp', 'mailspring-test-launch'),
        });
        console.log(`✓ Electron app launched`);
        console.log(`  Config dir: ${configDirPath}`);
        const window = await electronApp.firstWindow();
        if (window) {
            console.log(`✓ Main window available`);
            const title = await window.title();
            console.log(`  Window title: ${title}`);
        }
        else {
            console.log(`✗ No main window found`);
        }
        await electronApp.close();
        console.log('✓ App closed successfully');
        return true;
    }
    catch (err) {
        console.error('✗ Test failed:', err);
        return false;
    }
}
if (require.main === module) {
    testLaunch().then(success => {
        process.exit(success ? 0 : 1);
    });
}
