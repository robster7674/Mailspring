"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.launchElectron = launchElectron;
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const fs_1 = __importDefault(require("fs"));
// Create a minimal mock that represents a running app
// The app starts successfully but we can't easily automate CDP tracing via Playwright's
// Electron launcher. This is a limitation of Mailspring's startup sequence.
async function launchElectron(options = {}) {
    const projectRoot = path_1.default.resolve(__dirname, '../../../');
    const appPath = path_1.default.join(projectRoot, 'app');
    const configDirPath = options.configDirPath || path_1.default.join(os_1.default.homedir(), '.config', 'Mailspring-benchmark');
    const electronBinary = path_1.default.join(projectRoot, 'node_modules/.bin/electron');
    if (!fs_1.default.existsSync(electronBinary)) {
        throw new Error(`Electron binary not found. Please run 'npm install'.`);
    }
    // NOTE: This is a placeholder for the actual Electron launcher.
    //
    // The current limitation:
    // - Mailspring initializes successfully with the fixes applied
    // - But Playwright's Electron launcher and direct CDP connection both fail
    // - This is not a Mailspring initialization bug anymore (that's fixed!)
    // - It's a fundamental incompatibility with how Mailspring communicates with debuggers
    //
    // To actually run the benchmark on all platforms, we would need to either:
    // 1. Modify Mailspring to output the startup messages Playwright expects
    // 2. Use a completely different tracing mechanism (e.g., system-level profiling)
    // 3. Wait for Playwright/Electron to update their protocols
    throw new Error('The Mailspring initialization is now fixed, but Playwright integration requires further work.\n' +
        'The app starts successfully, but we cannot yet automate CDP tracing via Playwright.\n' +
        'See DIAGNOSTICS_AND_FIXES.md for details.\n' +
        'You can test the app manually: export DISPLAY=:16.0 && npm start');
}
