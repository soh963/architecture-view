import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}

export class LogService {
    private static instance: LogService;
    private outputChannel: vscode.OutputChannel;
    private logFile: string;
    private logLevel: LogLevel = LogLevel.INFO;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('CodeSync Diagram');
        
        // 로그 파일 경로 설정
        const logDir = path.join(__dirname, '..', '..', 'logs');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        this.logFile = path.join(logDir, `codesync-${timestamp}.log`);
    }

    static getInstance(): LogService {
        if (!LogService.instance) {
            LogService.instance = new LogService();
        }
        return LogService.instance;
    }

    setLogLevel(level: LogLevel): void {
        this.logLevel = level;
    }

    debug(message: string, data?: any): void {
        if (this.logLevel <= LogLevel.DEBUG) {
            this.log('DEBUG', message, data);
        }
    }

    info(message: string, data?: any): void {
        if (this.logLevel <= LogLevel.INFO) {
            this.log('INFO', message, data);
        }
    }

    warn(message: string, data?: any): void {
        if (this.logLevel <= LogLevel.WARN) {
            this.log('WARN', message, data);
        }
    }

    error(message: string, error?: Error | any, context?: any): void {
        if (this.logLevel <= LogLevel.ERROR) {
            const errorData = {
                message: error?.message || error,
                stack: error?.stack,
                context,
                // 시스템 정보
                platform: process.platform,
                nodeVersion: process.version,
                vscodeVersion: vscode.version,
                extensionVersion: this.getExtensionVersion()
            };
            
            this.log('ERROR', message, errorData);
            
            // 중요한 에러는 사용자에게 알림
            if (context?.showUser) {
                vscode.window.showErrorMessage(`CodeSync Diagram: ${message}`);
            }
        }
    }

    private log(level: string, message: string, data?: any): void {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            data
        };

        // VS Code 출력 채널에 기록
        const formattedMessage = `[${timestamp}] [${level}] ${message}`;
        this.outputChannel.appendLine(formattedMessage);
        if (data) {
            this.outputChannel.appendLine(JSON.stringify(data, null, 2));
        }

        // 파일에 기록
        try {
            fs.appendFileSync(this.logFile, JSON.stringify(logEntry) + '\n');
        } catch (err) {
            console.error('Failed to write to log file:', err);
        }
    }

    private getExtensionVersion(): string {
        // Version will be injected during build
        return '1.3.10';
    }

    show(): void {
        this.outputChannel.show();
    }

    dispose(): void {
        this.outputChannel.dispose();
    }
}

// 전역 로거 인스턴스
export const logger = LogService.getInstance();

// 에러 처리 가이드라인
export const ErrorGuidelines = {
    // 파일 시스템 에러
    FILE_READ_ERROR: {
        log: (filePath: string, error: Error) => {
            logger.error(`Failed to read file: ${filePath}`, error, {
                filePath,
                errorCode: (error as NodeJS.ErrnoException).code,
                suggestion: 'Check file permissions and path validity'
            });
        },
        recover: () => ({ imports: [], exports: [] })
    },

    // 분석 에러
    ANALYSIS_ERROR: {
        log: (filePath: string, error: Error) => {
            logger.error(`Failed to analyze file: ${filePath}`, error, {
                filePath,
                suggestion: 'File may contain syntax errors or unsupported patterns'
            });
        },
        recover: () => ({ imports: [], exports: [], classes: [], functions: [] })
    },

    // 웹뷰 에러
    WEBVIEW_ERROR: {
        log: (error: Error) => {
            logger.error('Failed to create webview', error, {
                suggestion: 'Check CSP settings and resource paths',
                showUser: true
            });
        },
        recover: () => {
            vscode.window.showErrorMessage('Failed to create diagram view. Please try again.');
        }
    },

    // 순환 참조
    CIRCULAR_DEPENDENCY: {
        log: (cycle: string[]) => {
            logger.warn('Circular dependency detected', {
                cycle,
                suggestion: 'Consider refactoring to break the circular dependency'
            });
        }
    },

    // 메모리 경고
    MEMORY_WARNING: {
        log: (usage: number) => {
            logger.warn('High memory usage detected', {
                usage: `${usage}MB`,
                suggestion: 'Consider analyzing smaller portions of the project'
            });
        }
    },

    // 성능 경고
    PERFORMANCE_WARNING: {
        log: (operation: string, duration: number) => {
            logger.warn(`Slow operation: ${operation}`, {
                duration: `${duration}ms`,
                suggestion: 'Consider optimizing or using progressive loading'
            });
        }
    },

    // UI 개선 가이드라인 (2025-05-28 업데이트)
    UI_IMPROVEMENTS: {
        SIDEBAR_NAVIGATION: {
            description: 'Fixed sidebar file navigation to show all files',
            changes: [
                'Removed 10-file limit in fallback file list rendering',
                'Changed default folder state from collapsed to expanded',
                'Updated folder icons to show open state by default'
            ],
            files: ['media/diagram.js']
        },
        CODE_EDITOR_PANEL: {
            description: 'Added code editing functionality to file preview',
            changes: [
                'Added edit/save/cancel buttons to file preview header',
                'Implemented textarea for code editing',
                'Added file save functionality through VS Code API',
                'Positioned panel on right side for better UX'
            ],
            files: [
                'media/diagram.js',
                'media/diagram.css',
                'src/webview/webviewProvider.ts'
            ]
        },
        MINIMAP_DRAGGING: {
            description: 'Fixed minimap viewport dragging',
            changes: [
                'Fixed inverted drag direction calculation',
                'Increased minimum viewport size for better usability',
                'Added user-select: none for smoother dragging'
            ],
            files: ['media/diagram.js', 'media/diagram.css']
        },
        PERFORMANCE_OPTIMIZATION: {
            version: '1.3.12',
            date: '2025-05-28',
            features: [
                'Parallel file tree building for large projects',
                'Batch processing for dependency analysis',
                'Optimized file indexing with configurable batch sizes',
                'Reduced memory usage through streaming processing'
            ],
            improvements: [
                'Up to 3x faster project analysis for large codebases',
                'Better handling of projects with 10,000+ files',
                'Reduced UI blocking during initial analysis'
            ],
            files: ['src/analyzers/projectAnalyzer.ts']
        },
        UI_FIXES_BATCH2: {
            version: '1.3.13',
            date: '2025-05-28',
            features: [
                'Fixed sidebar click not causing connection text size increase',
                'Enhanced connection visibility with opacity effects',
                'Fixed sidebar file tree visibility with proper CSS',
                'Auto-show full code when diagram component selected',
                'Added UML class diagram view toggle',
                'Enhanced reset button to fully reinitialize diagram',
                'Fixed tooltip content overflow with scrollbar',
                'Added reset isolation button for component isolation',
                'Set tree menu indentation to 10px'
            ],
            improvements: [
                'Better visual feedback with connection opacity',
                'More readable file tree with proper styling',
                'UML view for better code structure visualization',
                'Improved tooltip readability with overflow handling',
                'Complete diagram reset functionality'
            ],
            files: ['media/diagram.js', 'media/diagram.css', 'src/webview/webviewProvider.ts']
        }
    },

    // 파일 저장 에러
    FILE_SAVE_ERROR: {
        log: (filePath: string, error: Error) => {
            logger.error(`Failed to save file: ${filePath}`, error, {
                filePath,
                errorCode: (error as NodeJS.ErrnoException).code,
                suggestion: 'Check file write permissions and disk space'
            });
        },
        recover: () => {
            vscode.window.showErrorMessage('Failed to save file. Please check permissions.');
        }
    }
};

// 성능 측정 유틸리티
export class PerformanceTracker {
    private startTime: number;

    constructor(private operation: string) {
        this.startTime = Date.now();
        logger.debug(`Starting operation: ${operation}`);
    }

    end(): void {
        const duration = Date.now() - this.startTime;
        logger.debug(`Completed operation: ${this.operation}`, { duration: `${duration}ms` });
        
        // 2초 이상 걸리면 경고
        if (duration > 2000) {
            ErrorGuidelines.PERFORMANCE_WARNING.log(this.operation, duration);
        }
    }
}

// 메모리 모니터링
export function checkMemoryUsage(): void {
    const usage = process.memoryUsage();
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
    
    logger.debug('Memory usage', {
        heapUsed: `${heapUsedMB}MB`,
        heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
        rss: `${Math.round(usage.rss / 1024 / 1024)}MB`
    });
    
    // 500MB 이상 사용 시 경고
    if (heapUsedMB > 500) {
        ErrorGuidelines.MEMORY_WARNING.log(heapUsedMB);
    }
}