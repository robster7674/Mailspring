export declare function runStartupProfileScenario(): Promise<{
    timestamp: string;
    gitSha: string;
    runs: number;
    threadCount: number;
    median: {
        duration: number;
    };
    mean: {
        duration: number;
    };
    min: {
        duration: number;
    };
    max: {
        duration: number;
    };
}>;
