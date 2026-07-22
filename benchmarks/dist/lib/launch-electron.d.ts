export interface LaunchOptions {
    configDirPath?: string;
    headless?: boolean;
}
export declare function launchElectron(options?: LaunchOptions): Promise<{
    electronApp: import("playwright-core").ElectronApplication;
    configDirPath: string;
}>;
