import * as vscode from 'vscode';
import { analyzeProjectCommand } from './commands/analyzeProject';
import { logger } from './utils/logger';

export function activate(context: vscode.ExtensionContext) {
    logger.initialize(context).then(() => {
        logger.info('CodeSync Diagram extension activated', {
            version: context.extension.packageJSON.version,
            workspaceFolder: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
        });
    });

    const disposable = vscode.commands.registerCommand(
        'codesync.analyzeProject',
        async (uri: vscode.Uri) => {
            try {
                await analyzeProjectCommand(context, uri);
            } catch (error) {
                logger.error('Failed to execute analyze project command', error);
                vscode.window.showErrorMessage('프로젝트 분석 중 오류가 발생했습니다.');
            }
        }
    );

    context.subscriptions.push(disposable);

    // Register log commands
    context.subscriptions.push(
        vscode.commands.registerCommand('codesync.showLogs', () => {
            logger.show();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('codesync.clearLogs', async () => {
            await logger.clearLogs();
            vscode.window.showInformationMessage('로그가 삭제되었습니다.');
        })
    );
}

export function deactivate() {
    logger.info('CodeSync Diagram extension deactivated');
}