import { ResultsSummary } from '../lib/report';
export interface DatabaseQueryOptions {
    threadCounts?: number[];
    runs?: number;
    resultsDir?: string;
}
export declare function runDatabaseQueryScenario(options?: DatabaseQueryOptions): Promise<ResultsSummary>;
