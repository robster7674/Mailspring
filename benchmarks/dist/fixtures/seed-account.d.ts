export interface SeedOptions {
    configDir: string;
    threadCount?: number;
    messagesPerThread?: number;
}
export declare function seedAccount(options: SeedOptions): Promise<void>;
