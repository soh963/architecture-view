import * as vscode from 'vscode';
import { ProjectAnalyzer } from '../analyzers/projectAnalyzer';
import { DiagramWebviewProvider } from '../webview/webviewProvider';
import { logger } from '../services/logService';

export async function analyzeProjectCommand(
    context: vscode.ExtensionContext,
    uri: vscode.Uri | undefined
) {
    logger.info('Starting project analysis command', { uri: uri?.fsPath });
    
    try {
        const workspaceFolder = uri 
            ? vscode.workspace.getWorkspaceFolder(uri)
            : vscode.workspace.workspaceFolders?.[0];

        if (!workspaceFolder) {
            logger.warn('No workspace folder found');
            vscode.window.showErrorMessage('작업 공간을 찾을 수 없습니다.');
            return;
        }

        logger.info('Analyzing workspace', { path: workspaceFolder.uri.fsPath });

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '프로젝트 분석 중...',
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 10, message: '파일 스캔 중...' });
            logger.debug('Progress: Scanning files');
            
            const analyzer = new ProjectAnalyzer();
            const analysisResult = await analyzer.analyzeProject(workspaceFolder.uri.fsPath);
            
            logger.info('Analysis complete', {
                totalFiles: analysisResult.files.length,
                totalDependencies: analysisResult.dependencies.length,
                layers: Object.keys(analysisResult.layers).map(layer => ({
                    name: layer,
                    count: analysisResult.layers[layer].length
                }))
            });
            
            progress.report({ increment: 50, message: '의존성 분석 중...' });
            logger.debug('Progress: Creating webview');
            
            const webviewProvider = new DiagramWebviewProvider(context, analysisResult);
            const panel = webviewProvider.createWebview();
            
            progress.report({ increment: 40, message: '다이어그램 생성 완료!' });
            logger.info('Diagram created successfully');
            
            return panel;
        });

    } catch (error) {
        logger.error('Project analysis failed', error);
        vscode.window.showErrorMessage(`프로젝트 분석 실패: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}