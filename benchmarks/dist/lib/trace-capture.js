"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startTracing = startTracing;
exports.stopTracing = stopTracing;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
async function startTracing(electronApp, window, options) {
    const categories = options.categories || [
        'devtools.timeline',
        'blink.user_timing',
        'disabled-by-default-devtools.timeline',
        'disabled-by-default-v8.runtime',
    ];
    const cdpSession = await window.context().newCDPSession(window);
    try {
        await cdpSession.send('Tracing.start', {
            categories: categories.join(','),
            traceConfig: {
                recordMode: 'recordAsMuchAsPossible',
            },
        });
    }
    catch (err) {
        console.warn('Failed to start tracing:', err);
        throw err;
    }
    return cdpSession;
}
async function stopTracing(cdpSession, outputPath) {
    try {
        const traceData = await cdpSession.send('Tracing.end', {});
        const traceBuffer = traceData.value || [];
        // Write the trace to file
        fs_1.default.mkdirSync(path_1.default.dirname(outputPath), { recursive: true });
        fs_1.default.writeFileSync(outputPath, JSON.stringify(traceBuffer));
        return traceBuffer;
    }
    catch (err) {
        console.error('Failed to stop tracing:', err);
        throw err;
    }
}
