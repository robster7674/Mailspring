import { ElectronApplication, Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import WebSocket from 'ws';

export interface TraceOptions {
  outputDir: string;
  categories?: string[];
}

interface RawCDPSession {
  ws: WebSocket;
  messageId: number;
}

function isRawCDPSession(session: any): session is RawCDPSession {
  return session && session.ws && typeof session.messageId === 'number';
}

async function sendCDPCommand(session: RawCDPSession, method: string, params: any = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = session.messageId++;
    const message = JSON.stringify({ id, method, params });
    const timeout = setTimeout(() => {
      messageHandler = null;
      reject(new Error(`CDP timeout waiting for ${method}`));
    }, 5000);

    let messageHandler: ((data: string) => void) | null = (data: string) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.id === id) {
          clearTimeout(timeout);
          session.ws.removeListener('message', messageHandler!);
          messageHandler = null;
          if (response.error) {
            reject(new Error(`CDP error in ${method}: ${response.error.message}`));
          } else {
            resolve(response.result);
          }
        }
      } catch (e) {
        // Ignore parse errors, wait for the actual response
      }
    };

    session.ws.on('message', messageHandler);
    session.ws.send(message);
  });
}

export async function startTracing(
  electronApp: ElectronApplication | any,
  window: Page | any,
  options: TraceOptions
) {
  const categories = options.categories || [
    'devtools.timeline',
    'blink.user_timing',
    'disabled-by-default-devtools.timeline',
    'disabled-by-default-v8.runtime',
  ];

  let cdpSession: any;

  // Handle both Playwright and raw CDP sessions
  if (isRawCDPSession(electronApp?.cdpConnection)) {
    cdpSession = electronApp.cdpConnection;
  } else if (window && typeof window.context === 'function') {
    // Playwright API
    cdpSession = await window.context().newCDPSession(window);
  } else {
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
    } else {
      await cdpSession.send('Tracing.start', {
        categories: categories.join(','),
        traceConfig: {
          recordMode: 'recordAsMuchAsPossible',
        },
      });
    }
  } catch (err) {
    console.warn('Failed to start tracing:', err);
    throw err;
  }

  return cdpSession;
}

export async function stopTracing(cdpSession: any, outputPath: string) {
  try {
    let traceData: any;

    if (isRawCDPSession(cdpSession)) {
      traceData = await sendCDPCommand(cdpSession, 'Tracing.end', {});
    } else {
      traceData = await cdpSession.send('Tracing.end', {});
    }

    const traceBuffer = traceData.value || [];

    // Write the trace to file
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(traceBuffer));

    return traceBuffer;
  } catch (err) {
    console.error('Failed to stop tracing:', err);
    throw err;
  }
}
