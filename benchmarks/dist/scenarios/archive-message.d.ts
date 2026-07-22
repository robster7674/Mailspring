import { ResultsSummary } from '../lib/report';
export interface ArchiveScenarioOptions {
    threadCount?: number;
    messagesPerThread?: number;
    runs?: number;
    resultsDir?: string;
    compareWithSha?: string;
    headless?: boolean;
}
export declare function runArchiveScenario(options?: ArchiveScenarioOptions): Promise<ResultsSummary>;
