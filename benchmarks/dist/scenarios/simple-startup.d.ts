import { ResultsSummary } from '../lib/report';
export interface SimpleStartupOptions {
    threadCount?: number;
    runs?: number;
    resultsDir?: string;
}
export declare function runSimpleStartupScenario(options?: SimpleStartupOptions): Promise<ResultsSummary>;
