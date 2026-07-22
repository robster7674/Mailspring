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
    const projectRoot = path_1.default.resolve(__dirname, '../../../');
    const appPath = path_1.default.join(projectRoot, 'app');
    const configDirPath = options.configDirPath || path_1.default.join(os_1.default.homedir(), '.config', 'Mailspring-benchmark');
    const electronBinary = path_1.default.join(projectRoot, 'node_modules/.bin/electron');
    if (!fs_1.default.existsSync(electronBinary)) {
        throw new Error(`Electron binary not found. Please run 'npm install'.`);
    }
    // Now that the app initialization is fixed, use Playwright's standard Electron launcher
    const electronApp = await playwright_1._electron.launch({
        executablePath: electronBinary,
        args: [appPath, '--dev', '--config-dir-path', configDirPath, '--enable-logging'],
    });
    return { electronApp, configDirPath };
}
