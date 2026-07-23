import { ResultsSummary } from '../lib/report';
export interface AppStartupOptions {
    threadCount?: number;
    runs?: number;
    resultsDir?: string;
}
export declare function runAppStartupScenario(options?: AppStartupOptions): Promise<ResultsSummary>;
