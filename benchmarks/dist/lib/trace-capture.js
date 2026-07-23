"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startTracing = startTracing;
exports.stopTracing = stopTracing;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
function isRawCDPSession(session) {
    return session && session.ws && typeof session.messageId === 'number';
}
async function sendCDPCommand(session, method, params = {}) {
    return new Promise((resolve, reject) => {
        const id = session.messageId++;
        const message = JSON.stringify({ id, method, params });
        const timeout = setTimeout(() => {
            messageHandler = null;
            reject(new Error(`CDP timeout waiting for ${method}`));
        }, 5000);
        let messageHandler = (data) => {
            try {
                const response = JSON.parse(data.toString());
                if (response.id === id) {
                    clearTimeout(timeout);
                    session.ws.removeListener('message', messageHandler);
                    messageHandler = null;
                    if (response.error) {
                        reject(new Error(`CDP error in ${method}: ${response.error.message}`));
                    }
                    else {
                        resolve(response.result);
                    }
                }
            }
            catch (e) {
                // Ignore parse errors, wait for the actual response
            }
        };
        session.ws.on('message', messageHandler);
        session.ws.send(message);
    });
}
async function startTracing(electronApp, window, options) {
    const categories = options.categories || [
        'devtools.timeline',
        'blink.user_timing',
        'disabled-by-default-devtools.timeline',
        'disabled-by-default-v8.runtime',
    ];
    let cdpSession;
    // Handle both Playwright and raw CDP sessions
    if (isRawCDPSession(electronApp?.cdpConnection)) {
        cdpSession = electronApp.cdpConnection;
    }
    else if (window && typeof window.context === 'function') {
        // Playwright API
        cdpSession = await window.context().newCDPSession(window);
    }
    else {
        throw new Error('Unable to establish CDP session');
    }
    try {
        if (isRawCDPSession(cdpSession)) {
            await sendCDPCommand(cdpSession, 'Tracing.start', {
                categories: categories.join(','),
                traceConfig: {
                    recordMode: 'recordAsMuchAsPossible',
                },
            });
        }
        else {
            await cdpSession.send('Tracing.start', {
                categories: categories.join(','),
                traceConfig: {
                    recordMode: 'recordAsMuchAsPossible',
                },
            });
        }
    }
    catch (err) {
        console.warn('Failed to start tracing:', err);
        throw err;
    }
    return cdpSession;
}
async function stopTracing(cdpSession, outputPath) {
    try {
        let traceData;
        if (isRawCDPSession(cdpSession)) {
            traceData = await sendCDPCommand(cdpSession, 'Tracing.end', {});
        }
        else {
            traceData = await cdpSession.send('Tracing.end', {});
        }
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
