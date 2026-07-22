import { ElectronApplication, Page } from 'playwright';
import path from 'path';
import fs from 'fs';

export interface TraceOptions {
  outputDir: string;
  categories?: string[];
}

export async function startTracing(
  electronApp: ElectronApplication,
  window: Page,
  options: TraceOptions
) {
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
  } catch (err) {
    console.warn('Failed to start tracing:', err);
    throw err;
  }

  return cdpSession;
}

export async function stopTracing(cdpSession: any, outputPath: string) {
  try {
    const traceData = await cdpSession.send('Tracing.end', {});

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
