import { ResultsSummary } from '../lib/report';
export interface StartupScenarioOptions {
    threadCount?: number;
    messagesPerThread?: number;
    runs?: number;
    resultsDir?: string;
}
export declare function runStartupScenario(options?: StartupScenarioOptions): Promise<ResultsSummary>;
