import { ElectronApplication, Page } from 'playwright';
export interface TraceOptions {
    outputDir: string;
    categories?: string[];
}
export declare function startTracing(electronApp: ElectronApplication | any, window: Page | any, options: TraceOptions): Promise<any>;
export declare function stopTracing(cdpSession: any, outputPath: string): Promise<any>;
