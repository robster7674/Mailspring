import WebSocket from 'ws';
export interface LaunchOptions {
    configDirPath?: string;
    headless?: boolean;
}
interface CDPConnection {
    ws: WebSocket;
    messageId: number;
}
export declare function launchElectron(options?: LaunchOptions): Promise<{
    electronApp: any;
    configDirPath: string;
    cdpConnection?: CDPConnection;
}>;
export {};
