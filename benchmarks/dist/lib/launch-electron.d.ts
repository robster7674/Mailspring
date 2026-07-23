export interface LaunchOptions {
    configDirPath?: string;
    headless?: boolean;
}
export declare function launchElectron(options?: LaunchOptions): Promise<{
    electronApp: any;
    configDirPath: string;
}>;
