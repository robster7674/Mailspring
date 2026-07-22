import { ElectronApplication, Page } from 'playwright';
export interface TraceOptions {
    outputDir: string;
    categories?: string[];
}
export declare function startTracing(electronApp: ElectronApplication, window: Page, options: TraceOptions): Promise<import("playwright-core").CDPSession>;
export declare function stopTracing(cdpSession: any, outputPath: string): Promise<any>;
