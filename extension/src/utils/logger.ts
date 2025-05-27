import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}

export class Logger {
    private static instance: Logger;
    private outputChannel: vscode.OutputChannel;
    private logFile: string;
    private minLevel: LogLevel;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('CodeSync Diagram');
        this.logFile = '';
        this.minLevel = LogLevel.INFO;
    }

    static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    async initialize(context: vscode.ExtensionContext) {
        const logDir = path.join(context.globalStoragePath, 'logs');
        await this.ensureDirectory(logDir);
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        this.logFile = path.join(logDir, `codesync-${timestamp}.log`);
        
        // Get log level from configuration
        const config = vscode.workspace.getConfiguration('codesync');
        const levelStr = config.get<string>('logLevel', 'info').toUpperCase();
        this.minLevel = LogLevel[levelStr as keyof typeof LogLevel] || LogLevel.INFO;
        
        this.info('Logger initialized', { logFile: this.logFile, level: levelStr });
    }

    setLogLevel(level: LogLevel) {
        this.minLevel = level;
    }

    debug(message: string, data?: any) {
        this.log(LogLevel.DEBUG, message, data);
    }

    info(message: string, data?: any) {
        this.log(LogLevel.INFO, message, data);
    }

    warn(message: string, data?: any) {
        this.log(LogLevel.WARN, message, data);
    }

    error(message: string, error?: Error | any, data?: any) {
        const errorData = {
            ...data,
            error: error instanceof Error ? {
                message: error.message,
                stack: error.stack,
                name: error.name
            } : error
        };
        this.log(LogLevel.ERROR, message, errorData);
    }

    private async log(level: LogLevel, message: string, data?: any) {
        if (level < this.minLevel) return;

        const timestamp = new Date().toISOString();
        const levelStr = LogLevel[level];
        const logEntry = {
            timestamp,
            level: levelStr,
            message,
            data
        };

        // Format for output channel
        const formattedMessage = `[${timestamp}] [${levelStr}] ${message}`;
        if (data) {
            const dataStr = JSON.stringify(data, null, 2);
            this.outputChannel.appendLine(`${formattedMessage}\n${dataStr}`);
        } else {
            this.outputChannel.appendLine(formattedMessage);
        }

        // Write to file
        if (this.logFile) {
            try {
                const logLine = JSON.stringify(logEntry) + '\n';
                await fs.appendFile(this.logFile, logLine);
            } catch (err) {
                console.error('Failed to write to log file:', err);
            }
        }

        // Show error messages to user
        if (level === LogLevel.ERROR) {
            vscode.window.showErrorMessage(`CodeSync: ${message}`);
        }
    }

    show() {
        this.outputChannel.show();
    }

    async getLogs(lines: number = 100): Promise<string[]> {
        if (!this.logFile) return [];

        try {
            const content = await fs.readFile(this.logFile, 'utf-8');
            const allLines = content.trim().split('\n');
            return allLines.slice(-lines);
        } catch (error) {
            this.error('Failed to read log file', error);
            return [];
        }
    }

    async clearLogs() {
        if (!this.logFile) return;

        try {
            await fs.writeFile(this.logFile, '');
            this.outputChannel.clear();
            this.info('Logs cleared');
        } catch (error) {
            this.error('Failed to clear logs', error);
        }
    }

    private async ensureDirectory(dirPath: string) {
        try {
            await fs.mkdir(dirPath, { recursive: true });
        } catch (error) {
            console.error('Failed to create log directory:', error);
        }
    }
}

// Global logger instance
export const logger = Logger.getInstance();