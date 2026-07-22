"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.launchElectron = launchElectron;
const playwright_1 = require("playwright");
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const fs_1 = __importDefault(require("fs"));
async function launchElectron(options = {}) {
    // resolve from dist directory since this file is compiled
    const projectRoot = path_1.default.resolve(__dirname, '../../../');
    const configDirPath = options.configDirPath || path_1.default.join(os_1.default.homedir(), '.config', 'Mailspring-benchmark');
    // The built binary is the most reliable way to run Mailspring
    const builtBinaryPath = path_1.default.join(projectRoot, 'app/dist/mailspring-linux-x64/mailspring');
    if (!fs_1.default.existsSync(builtBinaryPath)) {
        throw new Error(`Mailspring built binary not found at ${builtBinaryPath}. ` +
            `Please run 'npm run build' to build the application.`);
    }
    // Set environment variables for the app
    const env = {
        ...process.env,
        // Tell Mailspring to use our benchmark config directory
        MAILSPRING_CONFIG_DIR: configDirPath,
    };
    const electronApp = await playwright_1._electron.launch({
        executablePath: builtBinaryPath,
        env,
        // Allow the Mailspring app to run in the background without requiring a display
        args: [],
    });
    return { electronApp, configDirPath };
}
